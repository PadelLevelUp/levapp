---
id: classes.instances
status: implemented
depends_on: [classes.create]
implements: ../../specs-business/classes/coach-runs-class-occurrences.business.md
governed_by: []
---

# classes.instances


### Intent
Lesson instances are the actual scheduled occurrences of a class. For recurring lessons, instances are materialized lazily (on-demand).

### Entities
- **LessonInstance** (`lesson_instances`): lesson_id, original_lesson_occurence_date, start_datetime, end_datetime, overwrite_title (NULL inherits, `classes.edit` rule 4), level_id, notifications_enabled, status (scheduled|canceled|rescheduled|completed), notes, max_players (+ max_players_override, held, PAD-275), coach_override_id (held, `classes.coach-assignment` rule 4), overridden_fields (JSON text, derived on read after PAD-275) — indexed on (lesson_id, original_lesson_occurence_date), the occurrence key every materialisation lookup takes (not unique yet: B-046), and on start_datetime

### Rules
1. **Lazy materialization**: Instances for recurring lessons are NOT pre-created. They are created on-demand when:
   - A reminder job fires for that date
   - A coach manually opens that date on the calendar
   - `get_or_materialize_instance(lesson, date)` is called
   - A student acts on the occurrence: a join request (`classes.join-requests` rule 2) or a
     cancellation / proactive decline sent as `(model, originalId, date)` (`attendance.confirm`
     rule 18, PAD-288/PAD-282). Both authorise the student before creating anything
2. On materialization:
   - Instance created from lesson template (`data_for_instance()`)
   - Presences created (invited=True, confirmed=False, enrolment_source=roster) for all enrolled players through `enrol()` — the presence row IS the per-occurrence enrolment (`classes.instance-enrollment` rule 1, PAD-259)
   - Scheduler jobs set up for reminders and invitation batches
   - Standing waiting list entries synced
3. Materialization is idempotent (safe to call multiple times)
4. Status transitions: scheduled → completed, scheduled → canceled, scheduled → rescheduled
5. **Not every step of rule 2 is essential.** Creating the instance row, its presences, and its
   scheduler jobs are essential — if one fails, materialization fails. Syncing standing waiting
   list entries is **best-effort**: it runs inside a SAVEPOINT and any failure in it must be
   contained, leaving the already-committed instance usable by the caller. A coach notifying a
   class must never see their request fail because a waiting-list side effect broke. Containment
   is never silent — every contained failure is logged at ERROR with its traceback, because
   reaching it means a callee misbehaved and that must stay diagnosable.
6. **The containment must not itself be able to raise.** Two shapes are guarded:
   - The savepoint is opened **before** the `try` that guards it, never inside it. An `except`
     branch that references a savepoint which was never opened raises `UnboundLocalError` and
     masks the original error.
   - The rollback is itself guarded. If the guarded block committed before failing, it ended the
     caller's transaction, and `savepoint.rollback()` raises the same "transaction is closed"
     error — which would escape as an HTTP 500, the exact failure the guard exists to prevent.
7. **Dead-session recovery.** When the guarded block has closed the transaction, containment is:
   log at ERROR with the traceback (this state means a callee violated the no-commit contract
   documented on `_sync_standing_entries_for_new_instance`, and must be diagnosable), call
   `db.session.rollback()` to restore a usable session for the rest of the request, and return the
   materialized instance — it was committed before the guarded block ran and is therefore valid.
   Waiting list rows staged inside the savepoint may or may not have persisted; rule 3's
   idempotency means a later materialization call reconciles them.
8. **Materialisation is serialised per series (PAD-261).** `get_or_materialize_instance` looks the
   occurrence up; a found occurrence takes no lock. A missing one locks the parent lesson row and is
   looked up again before it is created, so two concurrent callers (the scheduler and a request, say)
   produce one instance and the second finds the first. The lock ends at the next commit, and a
   caller that finds the instance under the lock commits at once, so a lookup never holds it. The unique occurrence key
   follows through the B-046 cleanup plan once duplicates on the staging copy of prod are merged.

### Acceptance Criteria

#### Lazy materialization
- **Given** a recurring lesson on Mondays at 10:00 with players Alice and Bob
- **When** the reminder job fires for April 20
- **Then** a LessonInstance is created for April 20 10:00-11:00
- **And** two Presence records are created (one for Alice, one for Bob) with invited=True

#### Instance status update
- **Given** a lesson instance with id 10 in status `scheduled`
- **When** coach POSTs to `/api/app/lesson_instance/10/status` with `{"status": "completed"}`
- **Then** the instance status changes to `completed`

#### A failing standing-waiting-list sync does not fail materialization
- **Given** a recurring lesson with an enrolled player, whose coach has an active standing waiting
  list entry, and whose occurrence for that date has never been materialized
- **When** the coach POSTs `/api/app/notify/send_reminders` for that occurrence and the standing
  entry sync raises a plain exception
- **Then** the request returns 200, the LessonInstance for that date exists, and the reminder is
  actually delivered to the enrolled player

#### A sync failure that closes the transaction is contained, not surfaced
- **Given** the same setup
- **When** the standing entry sync commits and *then* raises, closing the caller's transaction
- **Then** the request still returns 200 and the reminder is still actually delivered — not a 500
  `ResourceClosedError`
- **And** the failure is logged at ERROR level with its traceback

#### A savepoint that cannot be opened surfaces its own cause
- **Given** the same setup
- **When** opening the SAVEPOINT itself raises
- **Then** the error surfaced is that failure, never an `UnboundLocalError` from the guard

#### Two callers materialise the same occurrence at once (PAD-261, Postgres)
- **Given** a recurring occurrence that has never been materialised
- **When** two callers ask for it at the same moment
- **Then** exactly one instance exists for that date and both get it
