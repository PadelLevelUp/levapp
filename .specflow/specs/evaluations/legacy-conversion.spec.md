---
id: evaluations.legacy-conversion
status: draft
depends_on: [evaluations.records, evaluations.competencies, evaluations.legacy-client-contract, evaluations.history, evaluations.evolution]
implements: ../../specs-business/evaluations/coach-evaluates-a-player.business.md
governed_by: [R-047, R-048]
provenance:
  - derives_from: archive/documents/sistema-de-avaliacoes-2026-09-21/extracted/open-questions.md
---

# evaluations.legacy-conversion

> **Owner decision, 2026-09-22 (Q1, the non-default).** Every legacy 1–10 evaluation score
> becomes 1–5 stars in ONE data migration, with one fixed mapping, and the 1–10 scale is
> dropped. Not coach-triggered, not per category. Ticket PAD-403. The rule that decides what
> the App Store builds see (rule 7) is **pending the Coordinator's choice** and marked so.

### Intent
The new evaluation system rates on 1–5 stars everywhere. The categories coaches created before
it — every one of them 1–10 in production (7 categories, 16 entries, 2 coaches, 4 players on
2026-09-22) — are converted once, by the server, so a coach sees one scale, one control and one
chart; nothing a coach entered is lost, and the App Store builds that still call the frozen
endpoints (R-047) keep working.

### Entities
- **WRITES:** EvaluationEntry (`score`, new column `score_before_conversion INTEGER NULL`),
  EvaluationCategory (`scale_min`, `scale_max`, new column `scale_max_before_conversion INTEGER
  NULL`). Migration slot 4; parent = slice 8's revision (`evaluations.reminders`); developed on
  `21c864b3dd59` and re-parented before the PR.
- **READS:** nothing else. **Never touches:** `evaluated_at`, `record_id`, `created_at`,
  `updated_at`, `evaluation_records`, `evaluation_shares`.

### Rules
1. **The mapping is `stars = ceil(score / 2)`** — 1–2 → 1, 3–4 → 2, 5–6 → 3, 7–8 → 4,
   9–10 → 5. It is the proportional rescale `round_half_up(1 + (score − 1) × 4/9)` and the
   "half the scale" reading at once; it sends the App Store builds' untouched midpoint 6 to 3★;
   and it round-trips with `score = 2 × stars` (rule 7). It is a constant in one server
   function, pinned value by value; no client re-derives it (R-048).
2. **One migration converts everything.** For every `evaluation_categories` row with
   `competency_group IS NULL` and `scale_max = 10`, and every `evaluation_entries` row under it
   whose `score_before_conversion IS NULL`: copy `score` into `score_before_conversion`, set
   `score = ceil(score / 2)`; then copy the category's `scale_max` into
   `scale_max_before_conversion` and set `scale_min = 1, scale_max = 5`. Record-less rows (Q29)
   convert with the rest: read by nothing, but not left on a dropped scale.
3. **Nothing is lost, and the migration walks both ways.** The original values live in the
   two `*_before_conversion` columns for as long as the rows exist; `downgrade` restores `score`
   and the scale from them and nulls both; `upgrade` again re-converts. The `IS NULL` guards make
   a second `upgrade` a no-op; every DDL is guarded (prod-schema-drift rule); no row is deleted
   or re-dated. Proof: the migration-walk test on Postgres — upgrade / downgrade / upgrade with
   the seeded rows checksummed equal at each return — and Session-A's production-shaped dry-run
   on a fresh dump, a promotion gate.
4. **The owner's yes on the row table is a precondition, not a formality.** The 16 production
   rows before → after under rule 1 are on the ticket (entry ids only); the migration reaches
   production only after the owner has seen them and said yes (the Coordinator carries it). The
   table names the collapses: 7/8 → 4★, 9/10 → 5★, 5/6 → 3★.
5. **After conversion, no category is 1–10.** `_scale()`'s legacy default and every "n/max
   with a stepper" path (`evaluations.history` rule on legacy rendering, `ScoreStepper` on web,
   `score-stepper` on iOS) are retired or left dormant with the reason written at the line; the
   backend pins that no `evaluation_categories` row holds `scale_max ≠ 5` on the seeded and on
   the converted fixtures. A legacy category created AFTER conversion by an App Store build
   (1.1.0's `add_evaluation_categories`) is created **1–5** (rule 7 decides how that build sees
   it).
6. **Figures follow the new values.** Monthly means, rolling means, deltas, "latest", the class
   panel's summaries and the history cards read the converted scores (R-048, on read; nothing is
   cached). **Share snapshots keep the numbers they froze** (`evaluations.sharing` rule 7): a
   card shared before the conversion still says 7/10 — stated on the card's date, not rewritten.
7. **What the App Store builds see — PENDING the Coordinator's choice.** iOS 1.0 (build 3) and
   1.1.0 (build 4) render legacy categories as numbers through the five frozen endpoints and
   post a value for every category on save. Two shapes, one to be chosen before anything is
   built, both keeping R-047 point 7's pins byte-identical or making an explicit, audited pin
   update:
   - **A — serve 1–5 as stored:** `GET /evaluation_categories` and `player_profile` answer
     `scaleMin 1, scaleMax 5, score = stars`; admissible only if both builds derive their
     control's range and untouched default from the payload's `scaleMin`/`scaleMax` (evidence:
     the two trees, file:line); a build that hard-codes 10 or the midpoint 6 would post
     out-of-range scores into a converted category (B-126: no server range check there).
   - **B — the frozen endpoints keep speaking 1–10 for legacy categories:** out, `score =
     2 × stars` with `scaleMin 1, scaleMax 10`; in, `stars = ceil(v / 2)`; the five handlers'
     shapes and the PAD-362/363 pins stay byte-identical, the builds notice nothing, and the
     midpoint round-trips (6 → 3★ → 6, so "equal to latest → skip" keeps holding). The dropped
     scale survives only as a presentation mapping inside those five handlers, retired with
     them (R-047 point 8).
8. **Web and iOS ship together.** Both render every category as stars after this ticket;
   unit tests assert the rendering of fixed responses (never the mapping — that is the server's
   pin); Playwright and Maestro (flow number agreed with E and C) exercise a converted category
   in history, evolution and the class panel.

### Touches
- `evaluations.legacy-client-contract` — gains the rule that rule 7's choice produces; its pins
  stay byte-identical or are updated as an audited change to R-047.
- `evaluations.history` — the legacy stepper rendering rule is retired (rule 5).
- `evaluations.competencies` — `_scale()` no longer has a 1–10 branch; new legacy categories
  are 1–5.
- `evaluations.sharing` — snapshots unaffected (rule 6).

### Acceptance Criteria

#### The mapping, value by value (rule 1)
- **Given** scores 1 … 10
- **Then** `to_stars` answers 1, 1, 2, 2, 3, 3, 4, 4, 5, 5 and `to_legacy` answers 2, 4, 6, 8, 10
  for stars 1 … 5

#### One migration converts everything and keeps the originals (rules 2, 3)
- **Given** the seeded legacy category "Forehand" (1–10) with entries 7 (record-held) and 9
  (record-less) and a catalogue competency rated 4 (1–5)
- **When** the migration upgrades
- **Then** Forehand is 1–5 with `scale_max_before_conversion = 10`, its entries read 4 and 5 with
  `score_before_conversion` 7 and 9, the catalogue rating is untouched, no `evaluated_at` or
  `record_id` changed
- **When** it downgrades and upgrades again
- **Then** the rows are byte-identical to before the first upgrade after the downgrade, and to
  after the first upgrade after the second — and a third upgrade changes nothing

#### No category is 1–10 afterwards (rule 5)
- **Given** the converted fixtures
- **Then** `select count(*) from evaluation_categories where scale_max <> 5` is 0

#### The figures follow, the snapshot does not (rule 6)
- **Given** a shared card frozen with Forehand 7/10 before the conversion
- **When** the conversion runs and the player's evolution is read
- **Then** the evolution's series is computed from 4★, and the shared card still holds 7 with
  `scaleMax 10`

#### The App Store 2×2 (rule 7 — written for the chosen shape)
- **Given** a converted legacy category and an unconverted-shaped request from a pinned build
- **Then** the endpoint answers exactly what the chosen shape says, and the PAD-362/363 pin
  files pass unchanged (or their audited update is the only diff)

### Notes
- Production rows (Session-A, 2026-09-22 08:50:35 UTC): 16 entries, all 1–10; five midpoint 6s;
  three same-day-history rows; the table is on PAD-403.
- Playwright and unit tests locate by test id; criteria quote copy for the reader only.
