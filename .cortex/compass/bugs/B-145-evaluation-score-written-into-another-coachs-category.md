---
id: B-145
title: "A coach can write an evaluation score into another coach's category; an unknown category id is a 500 after the earlier scores were kept"
type: incomplete-rule
severity: high
status: resolved
resolved: 2026-09-21T18:43:00Z
affects:
  - evaluations.entries
  - R-002
  - backend/padel_app/services/coach_service.py
proposed_fix: "add_evaluation_entry_service accepts a score only for one of the calling coach's own categories; any other categoryId is ignored with the same 200 (PAD-370)."
opened: 2026-09-21T18:41:22Z
---

# B-145 — a score written into another coach's category

**Source:** found by Session-E while building the legacy-endpoint freeze (PAD-363): the freeze needed to
load the category a score names, and nothing had ever checked whose it was. Split out as PAD-370 at the
Coordinator's instruction so the fix does not wait for PAD-363's production-shaped dry-run. Id from
Session-E's range (B-145–149).

**What happens** (reproduced 2026-09-21 18:39 UTC on `178eeae73` — `origin/staging` `00e53375f` plus
PAD-362's pins — by running the requests below; production runs the same handler):

- `POST /api/app/add_evaluation_entry` with `scores: [{categoryId: <another coach's category>, value: 3}]`
  answers **200** and writes `evaluation_entries(coach_player_id = the caller's link, category_id = the
  other coach's category)`. Observed: `FOREIGN status 200 rows [(1, 3, 3.0)]`, category 3 owned by the
  other coach.
- With `[{categoryId: <own Forehand>, value: 6}, {categoryId: 987654, value: 3}]` the request raises
  `IntegrityError: NOT NULL constraint failed: evaluation_entries.category_id` (a 500 in production) and
  **Forehand 6 stays written** — the save is not atomic (pinned by PAD-362). Observed:
  `UNKNOWN raised IntegrityError … rows [(1, 1, 6.0)]`.

**What should happen:** a score is recorded only in one of the calling coach's own categories (compass
R-002: evaluation categories are coach-scoped). Anything else is ignored; the response does not change.

**What it exposes.** Category ids are sequential integers. The writing coach's
`GET /app/player_profile/<id>` then serialises the other coach's category **name and scale** for that row
(`get_player_profile` reads `entry.category` with no coach filter). For the other coach nothing shows on
their players, but `GET /app/evaluation_category/<id>/impact` counts the foreign rows, and deleting the
category cascades to the writer's rows. No player, score or note of the other coach is shown to anyone.
Whether such rows exist on production: not known — a read-only count is statement 2c of
`docs/reference/evaluations-prod-counts.sql`, waiting with Session-A. No client sends a foreign id on its
own; an App Store 1.0/1.1.0 build *does* send an unknown id when a category was deleted on another device,
and then fails every save until it refetches.

**Root cause:** `add_evaluation_entry_service` passed `score["categoryId"]` straight into the entry form's
`ManyToOne` (`backend/padel_app/services/coach_service.py`), which resolves any existing
`EvaluationCategory` id, and `None` for a missing one. `evaluations.entries` rule 1 scopes an entry to "a
coach-player relationship + category" and never says whose category — **Type 2, incomplete rule**. The
observation that selected the type: the row was written with a 200 (no rule or criterion forbade it), not
refused by a rule the code then failed to honour. Drift check: the business spec ("evaluation categories
belong to the coach who created them") already says it; the dev spec did not carry it to this endpoint.

**Affected specs:**
- Dev: `.specflow/specs/evaluations/entries.spec.md`
- Business: `.specflow/specs-business/evaluations/coach-evaluates-a-player.business.md` (unchanged)

### Change Plan

**Spec to modify:** `.specflow/specs/evaluations/entries.spec.md` — add rule 8 and the criterion "A score
for a category that is not the coach's own is ignored (rule 8)".
1. Test `backend/padel_app/tests/test_pad370_evaluation_entry_own_categories.py`: own category written;
   another coach's ignored; unknown and non-numeric ids ignored with the earlier scores kept; the profile
   never carries another coach's category. Run on the old code (fails) and the new (passes) — the 2×2.
2. Fix: build the set of the coach's own category ids once and skip any score outside it.
3. Regression: PAD-362's pins and the evaluation test files, on sqlite and Postgres.

Not in this change: finding or repairing rows already written (count first — statement 2c).

### Resolution

- Spec changes: `.specflow/specs/evaluations/entries.spec.md` — rule 8 and its criterion.
- Tests added: `backend/padel_app/tests/test_pad370_evaluation_entry_own_categories.py` (5). The 2×2, run
  2026-09-21 18:42–18:43 UTC: on the old code (`00e53375f`) the two own-category tests pass and the three
  foreign/unknown tests fail — `assert [(1, 2, 3.0)] == []`, `['Forehand', 'Serve'] == ['Forehand']`, and
  `IntegrityError`; on the fix all five pass, sqlite and Postgres. PAD-362's 30 pins pass on the fix.
- Code changes: `add_evaluation_entry_service` builds the set of the coach's own category ids and skips a
  score outside it (`backend/padel_app/services/coach_service.py`).
- Not done: counting or repairing rows already written on production (statement 2c of
  `docs/reference/evaluations-prod-counts.sql` is waiting with Session-A).
- Resolved: 2026-09-21 (PAD-370).
