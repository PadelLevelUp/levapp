---
concept: lazy-instance-materialisation
---

# Lazy instance materialisation

**Definition.** A recurring `Lesson` template only becomes a concrete
`LessonInstance` row (with seeded `Presence`s, scheduled reminder/invite
jobs, and standing-waiting-list fan-out) the first time something
actually needs to act on a specific calendar-date occurrence — attendance
gets recorded, a reminder fires, training is confirmed, etc. Looked up
by `original_lesson_occurence_date` (the canonical occurrence key), NOT
by reconstructing the datetime from the parent lesson's time-of-day,
because a single-occurrence edit can move an instance's time off the
parent's — the naive reconstruction misses and duplicate-materializes
(PAD-85/69). Materialization is wrapped so a best-effort side-effect
(standing waiting list sync) can never fail the caller: it runs inside
its own SAVEPOINT, contained so a failure there never poisons the
already-committed instance or the outer request (PAD-117 documents two
successive bugs in getting this containment right).

**Implementing files:**
- `backend/padel_app/services/lesson_service.py` —
  `get_or_materialize_instance` (the entry point), `create_lesson_instance_helper`.
- `backend/padel_app/services/notification_service.py` —
  `_sync_standing_entries_for_new_instance` (called from inside the
  materialization savepoint, so it must stage/flush only, never commit).
- `backend/padel_app/services/training_service.py`,
  `services/import_service.py` (`bulk_create_presences`) — both call
  `get_or_materialize_instance` rather than duplicating the logic.
- `backend/padel_app/scheduler.py` —
  `_run_reminder_for_lesson_occurrence` materializes on fire, the
  PRIMARY reminder path (vs. the legacy already-materialized-instance
  runner).

**Related concepts:** [[invitation-engine]] (a vacancy can only be
created against a materialized instance), [[club-local-day-boundary]]
(the occurrence date a lesson materializes for is a club-local calendar
day, not a UTC one).
