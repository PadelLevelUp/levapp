---
path: backend/padel_app/utils/notification_preview.py
extracted_at: 2026-09-03T13:58:46Z
extraction_level: 2
size_lines: 231
size_tokens: 1906
centrality: medium
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "e0b02b9082b8f6837826e36bb6cdb8b79893bd4336454128058f1c1237fe0d5b"
---

## Purpose

Pure, side-effect-free dry-run tooling for the notification engine —
intended for a Flask shell or ad-hoc script, never called from a
request/job path. `preview_notification_schedule` returns every
reminder/invite-start event that WOULD fire for a coach's upcoming
classes within a window, annotated with `will_fire`/`blocked_by` (quiet
hours, min-time-before-class). `simulate_batch_processor` replays the
`process_invitation_batches` inactivity-timer logic against a supplied
snapshot of vacancies, without touching the database. `print_schedule`
pretty-prints the former to stdout.

## Connections

- Uses: `padel_app.utils.dates.utcnow_naive`; lazily imports
  `padel_app.models` (`Association_CoachLessonInstance`,
  `LessonInstance`), `padel_app.scheduler._compute_timing_dt`, and
  `services/notification_service.py` (`get_or_create_config`).
- Used by: nothing in production code paths — this module exists purely
  as an operator/debugging tool, invoked manually.

## Insights

- None of the three functions write to the database or send anything —
  the module docstring states this explicitly as the design contract;
  any future change that adds a write here would violate the module's
  entire reason for existing (safe to run against production data
  without side effects).
- `simulate_batch_processor` reimplements — as a standalone, DB-free
  simulation — the same inactivity-timeout decision
  `process_invitation_batches` (in `notification_service.py`) makes
  live: fire once immediately for a fresh vacancy, then again every time
  `max_inactive_minutes` elapses without activity. Keeping the logic
  duplicated here (rather than importing the live function) is what
  lets it run over a synthetic snapshot; if the live batching rule
  changes, this simulation must be updated by hand to match.
