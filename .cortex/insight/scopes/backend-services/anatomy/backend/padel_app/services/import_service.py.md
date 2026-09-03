---
path: backend/padel_app/services/import_service.py
extracted_at: 2026-09-03T13:58:46Z
extraction_level: 3
size_lines: 860
size_tokens: 7614
centrality: high
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "13278b1618e43e6c2e3f95ffae981fd004c4fa7f5ffea152a8efa3b3866d7f01"
---

## Purpose

The DB-write side of bulk import, complementing `ai_service.py` (which
only ANALYZES a spreadsheet into staged table rows). Every
`bulk_create_*` function here takes those staged rows and a coach and
performs idempotent find-or-create writes against the real schema —
coach levels, evaluation categories, players, lessons, player↔lesson
associations, presences, evaluation entries, and coach notes
(strengths/weaknesses) — plus import history/`revert_import` to undo an
entire import by deleting every record it created, tracked by id. Every
function returns the same `{"imported": N, "errors": [...]}` shape (via
`_ok`), and every per-row failure is caught, the session rolled back,
and recorded in `errors` — one bad row is never allowed to abort the
whole batch.

## Main players

- `bulk_create_coach_levels` (lines 125–176) — supporting. Find-or-create
  by `(coach, code)`; applies the PAD-70 append-to-bottom rule
  (`is_unordered`/`next_display_order`) for rows with no explicit
  `display_order`, then normalizes the whole ladder once at the end.
- `_resolve_player_email` / `_build_fake_email` (lines 65–93) —
  supporting. Players are keyed by email, but imported spreadsheets
  frequently have none — this synthesizes a deterministic fake
  (`firstname_secondname@email.com`, collision-suffixed `_2`, `_3`, ...)
  so every player row still has a stable identity key for find-or-create.
- `bulk_create_players` / `_bulk_create_players_stream` (lines 227–369)
  — critical. Four-way branch per row: user+player already fully linked
  to this coach (skip), user+player exist but unlinked (create only the
  association + `PlayerLevelHistory` if a level matched), user exists
  with no `Player` (create `Player` + association), or nothing exists
  (full `create_player_helper` creation). Runs as a GENERATOR yielding
  `{"_progress": True, ...}` dicts every `_PROGRESS_EVERY` (5) rows when
  `stream=True`, specifically to keep the HTTP connection alive during a
  large import so a front gateway doesn't time out with a false 504;
  `stream=False` drains the same generator internally to preserve the
  original synchronous API.
- `bulk_create_lessons` (lines 376–434) — supporting. Find-or-create by
  `(coach, title)`; requires a `club` (returns an error result, not an
  exception, if the coach has none) since lessons are club-scoped.
- `bulk_create_player_lesson_associations` / `bulk_create_presences`
  (lines 441–583) — critical. Resolve rows by NAME/TITLE lookup against
  the coach's ALREADY-imported lessons/players (built as in-memory dicts
  up front) rather than by id — so import order across the several
  `bulk_create_*` calls matters (levels/players before lessons before
  associations before presences). `bulk_create_presences` materializes
  the `LessonInstance` on demand (`get_or_materialize_instance`, same
  mechanism as live attendance confirmation) and, uniquely among these
  functions, UPDATES an existing `Presence` on re-import (status/
  justification/`validated=True`) rather than skipping it — a re-run of
  the same import file is a live overwrite for presences, unlike the
  pure-skip idempotency of every other `bulk_create_*`.
- `bulk_create_evaluation_entries` (lines 590–699) — critical. Supports
  TWO row shapes autodetected from the first row's keys: "wide" format
  (every non-reserved key is a category name, its value the score — the
  spreadsheet's native shape) and "normalized" format
  (`category_name`/`score` columns — the AI pipeline's pivot-mapping
  output). A row can produce MULTIPLE entries in wide format (one per
  scored category) but exactly one in normalized format.
- `revert_import` / `_delete_by_ids` (lines 811–860) — critical. Deletes
  every record an import created, by id, in explicit REVERSE dependency
  order (notes → evaluation entries → presences → player-lesson
  associations → level history → coach-player associations → players →
  users → lessons → categories → levels) to avoid FK violations; refuses
  to double-revert (`status == "reverted"` check).

## Insights

- The whole module's correctness depends on caller-enforced ORDER
  across the several `bulk_create_*` calls — this file has no internal
  orchestrator (unlike `ai_service.ImportPipeline`) enforcing that
  levels/players are imported before lessons, before associations,
  before presences/evaluations/notes. Each function builds its own
  name-keyed lookup dict from what ALREADY EXISTS in the DB at call
  time, so calling them out of order silently produces "not found" row
  errors rather than a hard failure.
- `bulk_create_presences` is the one function in this file whose
  find-or-create is actually find-or-UPDATE: every other `bulk_create_*`
  treats an existing match as "nothing to do" and skips it, but a
  presence re-imported with a different status/justification
  overwrites the existing row. This asymmetry matters for
  `revert_import`, which can only restore a presence to NOT EXISTING,
  not to whatever it was before an overwriting re-import.
- Every `bulk_create_*` catches broad `Exception` per-row and calls
  `db.session.rollback()` before continuing to the next row — this means
  a mid-batch DB-level error (e.g. a constraint violation) rolls back
  only that pending row's uncommitted work, not the whole batch, and
  processing continues; `bulk_create_players` additionally has a
  narrower `IntegrityError` branch that recognizes a username
  `UniqueViolation` specifically and reports a friendlier
  "already exists with a different email" message instead of the raw
  DB error.
- `bulk_create_coach_notes`'s duplicate check compares against
  `coach_player.notes_list` filtered by `type` in-memory (not a DB
  query) — it is comparing against notes ALREADY LOADED via the
  relationship, which for a coach with many players/notes could be a
  large N+1-shaped load depending on how `notes_list` is defined
  (outside this scope, in `models`).
- Both `bulk_create_lessons` and `bulk_create_player_lesson_associations`/
  `bulk_create_presences` resolve lessons by TITLE and players by NAME —
  not by any imported spreadsheet row id — so two distinct players (or
  lessons) sharing an identical display name would collide in these
  lookup dicts (`setdefault` keeps only the FIRST match).

## Connections

- Uses: `padel_app.utils.dates.utcnow_naive`; `psycopg2.errors.UniqueViolation`;
  `sqlalchemy.exc.IntegrityError`; `services/level_ladder.py`
  (`is_unordered`, `next_display_order`, `normalize_display_orders`);
  `padel_app.sql_db.db`; `padel_app.models` (`CoachLevel`,
  `CoachPlayerNote`, `EvaluationCategory`, `EvaluationEntry`, `User`,
  `Player`, `Association_CoachPlayer`, `Association_PlayerLesson`,
  `Presence`, `PlayerLevelHistory`, plus lazily-imported `Lesson` and
  `padel_app.models.bulk_import.BulkImport`);
  `padel_app.tools.request_adapter.JsonRequestAdapter`;
  `padel_app.tools.calendar_tools.build_datetime`;
  `services/player_service.py` (`create_player_helper`);
  `services/lesson_service.py` (`create_lesson_helper`,
  `get_or_materialize_instance`).
- Used by: import/bulk-create routes (outside this scope, in the API
  layer), which presumably call this module's functions with the table
  rows `ai_service.stream_import_analysis` staged, and persist a
  `BulkImport` row recording each function's `created_ids` for later
  `revert_import`.

## Query pointers

- If you need to add a new importable table, mirror the pattern here:
  a `bulk_create_<table>` function returning `_ok(imported, errors,
  created_ids)`, PLUS a new branch in `revert_import`'s deletion order
  (mind FK dependency direction) and in `_delete_by_ids` calls.
- If a re-import is producing duplicates instead of skipping, check
  the function's uniqueness key first — it's a plain in-memory dict
  lookup (by code/name/title/email), never a DB uniqueness constraint,
  so a key mismatch (e.g. trailing whitespace) silently creates a
  duplicate rather than erroring.
- If you need to trace what a specific import actually wrote, read
  `get_import_history`/`revert_import` alongside `BulkImport.record_ids`
  (JSON-serialized `created_ids` from each `bulk_create_*` call) —
  that's the only durable record of which specific rows a given import
  created.
