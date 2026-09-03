---
path: backend/padel_app/services/coach_service.py
extracted_at: 2026-09-03T13:58:46Z
extraction_level: 2
size_lines: 268
size_tokens: 2230
centrality: medium
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "8136ffd3e3012273d22dba2517203de8fb3b086c5fe4ebcd737f00dc085e9d84"
---

## Purpose

Coach-scoped writes for level ladders, evaluation categories, coach
notes (strengths/weaknesses), and evaluation entries. Owns
`create_default_levels_for_coach` (seeds a new coach's 3 placeholder
levels L1/L2/L3, idempotent) and the batch-upsert paths
`upsert_coach_levels`/`upsert_evaluation_categories` that reconcile a
submitted list against existing rows by natural key (`code`/`name`
per coach) rather than by id.

## Connections

- Uses: `padel_app.models` (`Coach`, `CoachLevel`, `EvaluationCategory`,
  `CoachPlayerNote`, `EvaluationEntry`, `Association_CoachPlayer`);
  `services/level_ladder.py` (`get_level_ladder`, `is_unordered`,
  `next_display_order`, `normalize_display_orders`); `padel_app.sql_db.db`;
  `padel_app.tools.request_adapter.JsonRequestAdapter`.
- Used by: `services/club_service.py` (`create_default_levels_for_coach`,
  lazy-imported in `accept_coach_invitation_service`).

## Insights

- `upsert_coach_levels` is the load-bearing fix for PAD-70: it resolves
  each entry's `display_order` either from an explicit `displayOrder` or
  from its POSITION in the submitted list, then unconditionally calls
  `normalize_display_orders(coach.id)` afterward so gaps/duplicates/unset
  orders can never reach `level_ladder.py`'s ranking or the notification
  engine's eligibility checks.
- `create_coach_level_service` resolves the new level's position via
  `next_display_order` BEFORE constructing the `CoachLevel` object —
  deliberately, per its inline comment, because building the object
  first would attach it to the session and make the lookup query
  autoflush a half-built row.
- Upserts match existing rows by `(coach_id, code)` for levels and
  `(coach_id, name)` for evaluation categories — not by a submitted id —
  so renaming a level's `code` or a category's `name` in the payload
  creates a new row rather than updating the old one.
