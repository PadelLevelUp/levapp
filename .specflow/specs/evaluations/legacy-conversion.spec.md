---
id: evaluations.legacy-conversion
status: implementing
depends_on: [evaluations.records, evaluations.competencies, evaluations.legacy-client-contract, evaluations.history, evaluations.evolution]
implements: ../../specs-business/evaluations/coach-evaluates-a-player.business.md
governed_by: [R-047, R-048]
provenance:
  - derives_from: archive/documents/sistema-de-avaliacoes-2026-09-21/extracted/open-questions.md
---

# evaluations.legacy-conversion

> **Partly reversed by `evaluations.scale` (PAD-423, D147, 2026-09-25).** The 1–10 conversion
> below stands, but "1–5 stars everywhere" no longer does: a coach may now choose 1–10, 1–20 or
> 1–100 for their catalogue and custom competencies. Legacy categories are untouched.

> **Owner decision, 2026-09-22 (Q1, the non-default).** Every legacy 1–10 evaluation score
> becomes 1–5 stars in ONE data migration, with one fixed mapping, and the 1–10 scale is
> dropped. Not coach-triggered, not per category. Ticket PAD-403. What the App Store builds see
> (rule 7) is Option A, the Coordinator's ruling D106. The owner's yes on the mapping is D104.
> The import's handling of off-scale scores (rule 9) is ruling D111.

### Intent
The new evaluation system rates on 1–5 stars everywhere. The categories coaches created before
it — every one of them 1–10 in production (7 categories, 16 entries, 2 coaches, 4 players on
2026-09-22) — are converted once, by the server, so a coach sees one scale, one control and one
chart; nothing a coach entered is lost, and the App Store builds that still call the frozen
endpoints (R-047) keep working.

### Entities
- **WRITES:** EvaluationEntry (`score`, new column `score_before_conversion FLOAT NULL`, FLOAT like
  `score` so a non-whole original is restored exactly),
  EvaluationCategory (`scale_min`, `scale_max`, new columns `scale_min_before_conversion` and
  `scale_max_before_conversion`, both `INTEGER NULL`). The models declare all three, so
  `flask db check` sees no drift. Migration `e25428020888`, slot 4, parent `2240837cb663`
  (slice 8, `evaluations.reminders`). The chain is 21c864b3dd59 → 6a6ac64d814b → 2240837cb663 →
  e25428020888.
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
   `score = max(1, ceil(score / 2))` on the real value (D113). A legacy score need not be whole:
   8.5 → 5★, 7.5 → 4★, 0.5 → 1★. The migration computes it per row in Python, because
   `CAST(float AS INTEGER)` rounds on Postgres and truncates on SQLite; then copy the category's `scale_min` and `scale_max` into the two
   `*_before_conversion` columns and set `scale_min = 1, scale_max = 5`. The mapping is total: a
   score below 2, including a 0 on a 0–10 category, becomes 1★. Record-less rows (Q29) convert
   with the rest: read by nothing, but not left on a dropped scale.
3. **Nothing is lost, and the migration walks both ways.** The original values live in the
   two `*_before_conversion` columns for as long as the rows exist; `downgrade` restores `score`
   and the scale from them and nulls both; `upgrade` again re-converts. The `IS NULL` guards make
   a second `upgrade` a no-op; every DDL is guarded (prod-schema-drift rule); no row is deleted
   or re-dated. Proof: the migration-walk test on Postgres (`test_pad403_migration_postgres.py`)
   — upgrade / downgrade / upgrade with the seeded rows checksummed equal at each return and the
   converted values exact, 8.5 included — and Session-A's production-shaped dry-run on a fresh
   dump, a promotion gate.
4. **The owner's yes on the row table is a precondition, not a formality.** The 17 production
   rows before → after under rule 1 are on the ticket (entry ids only). Entry 17 is a real
   coach's rating, per the owner's ruling, and converts like the rest (6 → 3★); the migration reaches
   production only after the owner has seen them and said yes (the Coordinator carries it). The
   table names the collapses: 7/8 → 4★, 9/10 → 5★, 5/6 → 3★.
5. **After conversion, no category is 1–10.** `_scale()`'s legacy default and every "n/max
   with a stepper" path (`evaluations.history` rule on legacy rendering, `ScoreStepper` on web,
   `score-stepper` on iOS) are retired or left dormant with the reason written at the line; the
   backend pins that no `evaluation_categories` row is off 1–5 after the migration and after
   every write path. A legacy category created AFTER conversion is created **1–5** whatever
   scale it arrives with, whether by an App Store build (1.1.0's `add_evaluation_categories`;
   rule 7 decides how that build sees it) or by the spreadsheet or AI import
   (`bulk_create_evaluation_categories`). `EvaluationCategory.scale_max` defaults to 5.
6. **Figures follow the new values.** Monthly means, rolling means, deltas, "latest", the class
   panel's summaries and the history cards read the converted scores (R-048, on read; nothing is
   cached). **Share snapshots keep the numbers they froze** (`evaluations.sharing` rule 7): a
   card shared before the conversion still says 7/10 — stated on the card's date, not rewritten.
7. **What the App Store builds see — Option A, serve 1–5 as stored (Coordinator's ruling,
   2026-09-22, after the owner's yes on the mapping; D104).** The five frozen endpoints answer
   the converted values with `scaleMin 1, scaleMax 5` and keep their shapes; no mapping layer
   is added to any handler, so "the old scale is dropped" is true for every client. Evidence,
   read by Session-B in BOTH pinned trees (1.0 = `6f5d0c1ce`, 1.1.0 = `6b48f79e3`,
   `frontend/apps/mobile/src/features/players/add-evaluation-form.tsx`, identical lines): the
   untouched default is the payload's midpoint `existing?.score ?? Math.round((cat.scaleMin +
   cat.scaleMax) / 2)` (:62 → 3 for 1–5, the same value the migration gives a legacy midpoint 6);
   the stepper clamps to the payload's range `Math.min(max, Math.max(min, current + delta))`
   (:70) and its ends are `value <= cat.scaleMin` / `value >= cat.scaleMax` (:121-122); every
   category is posted on save (:81-85); the profile renders `{ev.score}/{ev.scaleMax}`
   (`app/player/[playerId].tsx` :436 / :432); no literal 0- or 10-bound assumption exists on
   those paths in either tree. So after conversion those builds show "3/5", step within 1–5 and
   post 1–5 — nothing to change in them. Consequences this ticket carries:
   - **A new legacy category from 1.1.0's editor is stored 1–5 whatever the body says** (its
     editor sends `scaleMin: 0, scaleMax: 10`, `evaluation-categories-section.tsx` :82-83,
     :136-138): `POST /add_evaluation_categories` creates or updates the row as 1–5 and echoes it
     as 1–5; the build reads the scale back from the payload and behaves. Pinned in the R-047
     pin file: 0/10 in → 1/5 out, and the midpoint 3 that build then posts is stored as 3.
   - **The R-047 pin files change** (`test_pad362_evaluation_contract.py`,
     `test_pad363_legacy_freeze.py`): they seed legacy categories as 1–10 and assert those
     numbers; the update is an explicit, audited pin update under R-047 point 7, in its own
     named commits (`e9303b373`, then `b6fd48408` after review). The Coordinator ruled that
     separate named commits satisfy D106(b) without a force-push. The diff is limited to the
     seeded scale and the expected numbers, it was reviewed by Session-C (the pins' author) as a
     change to R-047, and it is named "R-047 pin update" in the PR body. Five other files seed
     through pad362's `_seed` (pad364 ×4, pad375) and move to 1–5 in their own commit. They are
     not R-047 pins.
   - Option B (the five handlers mapping 2 × stars out and ceil(v / 2) in) was rejected: it
     keeps two numbers for one rating alive in five handlers until R-047 retires, and every
     future reader of those handlers inherits the mapping.
8. **Web and iOS ship together.** Both render every category as stars after this ticket;
   unit tests assert the rendering of fixed responses (never the mapping — that is the server's
   pin); Playwright and Maestro (flow number agreed with E and C) exercise a converted category
   in history, evolution and the class panel.
9. **The import refuses a score outside 1–5 (Coordinator's ruling D111).** Every category is
   1–5 after the conversion, so a score outside 1–5 in an imported sheet (spreadsheet or AI, both
   ending in `bulk_create_evaluation_entries`, wide or normalized format) is a row error in the
   import's errors list. It carries `code: "score_out_of_range"` with the category and the
   value, and nothing is stored for that cell; the row's in-range cells still import. Nothing is
   guessed: a 1–10 sheet whose scores are all ≤ 5 would otherwise be misread as stars. The web
   renders the error from `settings.import.rowErrors.score_out_of_range` (pt + en), which says
   what to do (rescale the sheet and import it again). **Web only, with the reason:** the iOS
   import pane is history and revert only; it has no uploader
   (`apps/mobile/src/features/settings/import-section.tsx`), so no iOS surface shows a row
   error. This is a user-visible change and is stated as such in the PR body.

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

#### A 0–10 category converts totally (rule 2)
- **Given** the legacy category "Volley" (0–10) with entries 0 and 10
- **When** the migration upgrades
- **Then** Volley is 1–5 with `scale_min_before_conversion = 0`, `scale_max_before_conversion =
  10`, and its entries read 1 and 5; a downgrade restores 0–10 and the entries 0 and 10

#### A non-whole score converts on its real value (rule 2, D113)
- **Given** a Forehand entry of 8.5 and a Volley entry of 0.5
- **When** the migration upgrades
- **Then** they read 5 and 1, with `score_before_conversion` 8.5 and 0.5 exactly; the
  downgrade restores 8.5 and 0.5

#### No category is off 1–5 afterwards (rule 5)
- **Given** the converted fixtures, or a category written by the frozen upsert (0/10 or 1/10 in),
  by the import ("0"/"10", 0/10, 1/7) or with no scale at all
- **Then** `select count(*) from evaluation_categories where scale_min <> 1 or scale_max <> 5` is 0

#### The import refuses a score off 1–5 (rule 9)
- **Given** a sheet row scoring Forehand 8 (or 0, 0.5, 5.5, 10) and Volley 4
- **When** it is imported, in the wide or the normalized format
- **Then** the errors list holds one `score_out_of_range` error for Forehand with the value, no
  Forehand entry is stored, Volley 4 is stored, and 1, 1.5, 3, "4" and 5 all import
- **And** the web shows the error in the coach's language, naming the category, the value and
  what to do

#### The figures follow, the snapshot does not (rule 6)
- **Given** a shared card frozen with Forehand 7/10 before the conversion
- **When** the conversion runs and the player's evolution is read
- **Then** the evolution's series is computed from 4★, and the shared card still holds 7 with
  `scaleMax 10` (pinned on Postgres in `test_pad403_migration_postgres.py`: the share row's card is
  byte-identical across upgrade, downgrade and re-upgrade)

#### The App Store 2×2 (rule 7 — written for the chosen shape)
- **Given** a converted legacy category and an unconverted-shaped request from a pinned build
- **Then** the endpoint answers exactly what the chosen shape says, and the PAD-362/363 pin
  files pass unchanged (or their audited update is the only diff)

### Notes
- Production rows (Session-A, 2026-09-22 08:50:35 UTC): 16 entries, all 1–10; five midpoint 6s;
  three same-day-history rows. Session-A's fresh read at 17:42:22 UTC found 17 entries (entry 17
  was rated at 17:35:40 UTC), with checksum `5b8e0790e0fc516291527a97e851d5a5`, re-read at cut
  time. The table is on PAD-403.
- Playwright and unit tests locate by test id; criteria quote copy for the reader only.
