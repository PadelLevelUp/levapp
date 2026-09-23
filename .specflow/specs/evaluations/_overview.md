# evaluations — Player Evaluation System

## What this is

How a coach records what a player is good at, over time — and, planned since the 2026-09-21
"Sistema de Avaliações" canvas, how they evaluate from a class, look back, and choose what a
player may see. The UI word is **competency**; the table, the wire key `categoryId` and every
endpoint an App Store build calls still say **category**.

## What it covers

Shipped — these describe only what is in production:

- `evaluations.categories` — implemented — the coach's categories, name uniqueness (PAD-273),
  audited delete (PAD-274), the name-keyed upsert
- `evaluations.entries` — implemented — one score row; the abstain and skip rules (PAD-337)
- `evaluations.player-view` — implemented — the latest-score card on the coach's player page;
  coach-only, no chart
- `evaluations.bulk-import` — implemented — evaluations inside the spreadsheet/AI import

Planned — all `draft`, from the canvas (archive `sistema-de-avaliacoes-2026-09-21`):

- `evaluations.legacy-client-contract` — the five endpoints App Store 1.0/1.1.0 call, frozen and
  legacy-only **by endpoint**, whatever headers a client sends. **Read this before touching any
  evaluation endpoint.**
- `evaluations.legacy-conversion` — implementing (PAD-403): every legacy 1–10 score becomes
  1–5 stars in one reversible data migration (`max(1, ceil(score/2))`, originals kept). After
  it, no category is off 1–5 on any write path, and the frozen save converts or refuses an
  off-scale body before writing (contract rule 10).
- `evaluations.competencies` — the catalogue of 17, on/off, custom, rename by id, delete
- `evaluations.records` — one record per player, class-or-none and day; the one writer; the
  backfill; the server range check
- `evaluations.class-panel` — evaluating a class's participants from the class detail
- `evaluations.history` — the profile card, the "Avaliações" drawer, "Nova avaliação", history
  cards, delete; the strengths/weaknesses rule
- `evaluations.evolution` — monthly means, rolling means, delta, the chart
- `evaluations.sharing` — implemented (PAD-402, owner-decided 2026-09-22) — choose, preview,
  share, un-share; one thread message, no push
- `evaluations.student-view` — implemented (PAD-402) — what a player sees; the one job of the
  `evaluations` capability token (gating the student dashboard block)
- `evaluations.reminders` — implementing (PAD-404, slice 8) — "Frequência de avaliações" and
  the server-computed due marker on the class panel and the players list; in-app only (Q4)

## Why it's grouped this way

One domain of the LevelUp product, migrated 2026-09-03 from the legacy `specs/evaluations/spec.md` (one file per domain) into one leaf per behaviour. Leaves sit directly under the domain — no capability folders yet.

The four shipped leaves stay `implemented` and say only what ships; each ends its Rules with a
"Superseded by / Planned" pointer. Everything unbuilt lives in a `draft` leaf, so no implemented
leaf describes behaviour that does not exist. Owner questions Q1–Q7 and build defaults Q8–Q27 are
in the canvas's archive entry (`extracted/open-questions.md`); rules that depend on an open owner
question carry an inline **(pending owner decision Qn)** tag.

## Related groups

- `classes` (the class detail and occurrences), `players` (the profile, strengths/weaknesses, the
  list), `dashboard` and `messaging` (the student's side of a share), `notifications` and
  `settings` (the reminder setting, the competency editor), `import`. Each planned leaf names
  what it will need there under "Touches"; none of those leaves has been edited yet.
