---
path: backend/padel_app/services/lesson_service.py
extracted_at: 2026-09-03T13:58:46Z
extraction_level: 3
size_lines: 1040
size_tokens: 9978
centrality: high
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "d2d7093086b455d79a8907458768621b84e60b0eb673ccc392e2f01a8e5be3fb"
---

## Purpose

The class/lesson domain core: `Lesson` (the recurring template) and
`LessonInstance` (one materialized occurrence) CRUD, lazy occurrence
materialization, scope-aware edit/removal ("this occurrence only" vs
"this and all future"), lesson-series splitting, and attendance
recording. This is where "a recurring class" becomes concrete rows on
specific dates — most other services in this scope (training, import,
season, presence overview) call into `get_or_materialize_instance` or
the edit/remove dispatchers rather than touching `LessonInstance`
directly.

## Main players

- `get_or_materialize_instance` (lines 102–203) — critical. THE lazy-
  materialization entry point: given a `Lesson` template and a calendar
  date, finds the existing `LessonInstance` for that occurrence or
  creates one (seeding `Presence` rows for every enrolled player,
  scheduling reminder/invite jobs, and best-effort syncing standing
  waiting-list entries inside a SAVEPOINT so a sync failure never fails
  the caller). Looked up by `original_lesson_occurence_date` — NOT by
  reconstructing `datetime.combine(date, lesson.start_datetime.time())`
  — because a single-occurrence edit can move an instance's time off the
  parent's, and the naive reconstruction would miss and duplicate-
  materialize (PAD-85/69's reminder-double-send root cause).
- `create_lesson_instance_helper` / `edit_lesson_instance_helper`
  (lines 206–312) — critical. Form-driven instance CRUD; both
  reconcile `add_player_ids`/`remove_player_ids`/`player_ids` into a
  deduped roster and (on edit) reschedule the instance's jobs since
  `start_datetime` may have changed.
- `add_presences` (lines 315–385) — critical. Attendance recording.
  Explicitly strips the reminder-flow flags (`invited`, `confirmed`,
  `late_cancellation`) from the form-derived values before writing —
  the PAD-69 boolean-coercion class of bug, where every Boolean form
  field is written on every submit — so marking attendance can never
  silently reset a student's RSVP answer. A walk-in with no existing
  `Presence` row also gets its missing `Association_PlayerLessonInstance`
  created here, mirroring what the vacancy-fill path does in
  `notification_service._add_player_to_instance` — required because
  `effective_filled_spots` counts that association, not presences.
- `split_lesson` (lines 517–548) — critical. The mechanism behind every
  "this and future" edit/removal: duplicates the lesson (new row,
  `duplicate_lesson_helper`), truncates the ORIGINAL's `recurrence_end`
  to just before the split point, reassigns future `LessonInstance`
  rows to the new lesson, and preserves the tail of the original
  recurrence on the new row. `recurrence_end` is INCLUSIVE (a bare date
  is coerced to end-of-day elsewhere), so removing "this date" must end
  the original the day BEFORE it (PAD-65) or the occurrence resurrects
  on reload.
- `edit_class_service` / `_apply_future_edit_to_lesson` /
  `_edit_future_instances_for_lesson` (lines 712–902) — critical. The
  scope-aware edit dispatcher: branches on whether the event is a
  materialized `LessonInstance` or a virtual `Lesson` occurrence, and
  within each, on `scope` (`single` vs `future`). A "future" edit off a
  Lesson (not an instance) can itself trigger a `split_lesson`-equivalent
  fork (`_apply_future_edit_to_lesson`) when the edited date isn't the
  lesson's own start date, producing a brand-new `Lesson` row that then
  needs its OWN reminder jobs scheduled from scratch (best-effort,
  wrapped in try/except so a scheduler failure never turns a successful
  edit into an error response, per PAD-10).
- `remove_class_service` / `_dispatch_remove_class` (lines 939–1039) —
  critical. Scope-aware removal, split into two functions (PAD-75)
  specifically so `remove_class_service` can snapshot cancellation
  recipients BEFORE deletion (roster/coach relations cascade-delete)
  and notify them AFTER a successful removal, without threading that
  concern through every early-return branch of the actual delete logic.
- `NoSeasonCoversDateError` (lines 29–48) — supporting but load-bearing.
  PAD-90's fail-closed guard: a class configured to "recur until season
  end" with no season covering its start date raises rather than
  silently writing a NULL `recurrence_end`, which every downstream
  reader treats as "recurs forever".

## Insights

- The `get_or_materialize_instance` savepoint handling documents a real
  incident (PAD-117): `db.session.begin_nested()` is opened OUTSIDE the
  `try` block deliberately — if opening the savepoint itself failed
  inside the `try`, the exception handler's `sp.rollback()` would raise
  `UnboundLocalError` and mask the real cause. A second, subtler bug the
  comments call out: if the guarded block's own `sp.commit()` fails
  AFTER already committing, the savepoint (and the outer transaction) is
  already closed, so calling `sp.rollback()` raises the SAME error again
  — which used to escape as an HTTP 500. The fix falls back to
  `db.session.rollback()` at the SESSION level in that case, which is
  survivable because the instance itself was already committed earlier
  and any waiting-list rows from the failed sync are reconciled
  idempotently on the next materialization call.
- `confirm_presences_service`'s docstring documents a fixed bug in how
  it distinguishes a materialized-instance id from a virtual-lesson-
  occurrence id: `originalId` lives in different id-spaces depending on
  context, and the FIX is to branch on the calendar-event `id` PREFIX
  (`"lessoninstance-<id>"` vs `"lesson-<id>-<date>"`) rather than the
  presence of `parentClassId` — which is added by the serializer
  whenever the DETAIL endpoint resolves to an instance, even when the
  underlying calendar event (and thus `originalId`) is still a Lesson
  id, e.g. a stale calendar page loaded before the occurrence was
  materialized elsewhere.
- `edit_class_service`'s "future" branches cancel the parent lesson's
  reminder jobs from a boundary of `new_date or event_date` — NOT
  `event_date` alone — with an inline comment explaining why: using
  `event_date` when the edit also MOVES the date would wrongly cancel
  jobs for occurrences in `[event_date, new_date)` that actually survive
  on the (unsplit) parent lesson.
- Every scheduler call in the edit/remove paths that runs AFTER a DB
  write is already committed is wrapped in try/except (sometimes
  logged, sometimes bare `pass`) — the recurring design principle,
  labeled PAD-10 in several comments, is that a scheduler-side failure
  must never turn an already-successful data mutation into an HTTP
  error response.
- `edit_lesson_helper` contains a commented-out block (triple-quoted,
  dead code) that would delete and recreate the lesson's
  `Association_CoachLesson` row on every edit — left in place, not
  removed, presumably as a note of a considered-and-rejected approach.

## Connections

- Uses: `padel_app.sql_db.db`; `padel_app.models` (`Lesson`,
  `LessonInstance`, `Presence`, `Association_CoachLesson`,
  `Association_PlayerLesson`, `Association_PlayerLessonInstance`,
  `Association_CoachLessonInstance`);
  `padel_app.tools.request_adapter.JsonRequestAdapter`;
  `padel_app.tools.calendar_tools` (`build_datetime`, `_format_time`,
  `_format_date`); `padel_app.helpers.calendar_helpers`
  (`load_lessons_for_coach`, `load_lesson_instances_for_coach`,
  `build_lesson_events` — outside this scope); `padel_app.scheduler`
  (`_maybe_schedule_instance`, `_maybe_cancel_instance`,
  `cancel_lesson_reminder_jobs`, `schedule_lesson_reminder_jobs`,
  `cancel_lesson_occurrence_job` — all lazily imported);
  `services/notification_service.py`
  (`_sync_standing_entries_for_new_instance`,
  `collect_cancellation_recipients`, `notify_students_of_cancellation` —
  lazily imported); `services/season_service.py`
  (`resolve_season_end_for_coach`, lazily imported).
- Used by: `services/training_service.py` (`confirm_training_service` →
  `get_or_materialize_instance`); `services/import_service.py`
  (`create_lesson_helper`, `get_or_materialize_instance`);
  `services/season_service.py` (`regenerate_future_instances_for_season`
  → `delete_future_instances`); `scheduler.py`'s job runners
  (`get_or_materialize_instance`, indirectly via
  `_run_reminder_for_lesson_occurrence`).

## Query pointers

- If you need to understand how a coach's edit to "this and all future"
  classes actually forks the data model, read `split_lesson` and
  `_apply_future_edit_to_lesson` together — both PRODUCE a new `Lesson`
  row and reassign future `LessonInstance` rows to it; then check the
  scheduler call immediately after in `edit_class_service` to see how
  the new lesson gets its own reminder jobs.
- If you need to change what happens when an occurrence materializes
  (e.g. new side-effects on instance creation), read
  `get_or_materialize_instance` end to end first — its savepoint
  handling is subtle and any new side-effect added there should follow
  the same "best-effort, contained failure" pattern as the standing-
  waiting-list sync.
- If attendance/presence writes seem to be clobbering RSVP state, start
  at `add_presences`'s explicit `values.pop(reminder_flag, None)` calls
  — any new Boolean field added to the Presence form must be
  reconsidered against this same PAD-69 hazard.
- If you need to trace scope-aware edit/removal behavior for a specific
  combination (Lesson vs LessonInstance × single vs future), read
  `edit_class_service`/`_dispatch_remove_class` directly — they are the
  dispatch tables, and each branch is short enough to read in isolation
  once you know which one applies.
