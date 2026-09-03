---
path: backend/padel_app/services/season_service.py
extracted_at: 2026-09-03T13:58:46Z
extraction_level: 2
size_lines: 223
size_tokens: 2034
centrality: medium
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "d2f8c8657f44e67ca195f1a23355af4d9bf8dabf1821d548e2fd68928daad7dd"
---

## Purpose

CRUD and overlap validation for a coach's `Season` ranges, plus
`regenerate_future_instances_for_season` which re-caps FUTURE recurring
lesson instances whenever a season's boundary changes (a lesson can be
configured to recur until its governing season's end). `upsert_seasons`
implements a strict "explicit deletes only" batch semantics (PAD-89): a
persisted season the payload doesn't mention is left untouched, never
silently deleted.

## Connections

- Uses: `padel_app.sql_db.db`; lazy imports of `padel_app.models.Season`,
  `services/lesson_service.py` (`delete_future_instances`),
  `padel_app.utils.dates.utcnow_naive`, and (inside a bare
  `try/except`) `padel_app.scheduler`
  (`schedule_lesson_reminder_jobs`, `cancel_lesson_reminder_jobs`).
- Used by: season-management routes (outside this scope, in the API
  layer); `regenerate_future_instances_for_season` is presumably called
  from a season-edit route after `upsert_seasons` changes an end date
  (not visible in this file).

## Insights

- PAD-89: `upsert_seasons` previously could resolve an overlap by
  silently deleting the season it collided with. The fix runs
  validation in two passes BEFORE any write — pairwise across the
  incoming payload, then DB-aware against the coach's persisted seasons
  the payload does NOT address (via `validate_no_overlap` with
  `exclude_ids`) — and raises `ValueError` to reject the whole batch on
  any conflict, rather than mutating anything.
- Seasons are matched by explicit `id` in the payload, or created when
  absent; an `id` not owned by the calling coach silently falls through
  to a create rather than raising, per an inline comment ("Only ids the
  coach actually owns can be addressed").
- `regenerate_future_instances_for_season` wraps its scheduler
  reschedule calls in a bare `try/except Exception: pass` — the
  docstring notes this is "no-op in tests" but the same swallow also
  hides any production scheduler failure silently; there is no logging
  on that path.
