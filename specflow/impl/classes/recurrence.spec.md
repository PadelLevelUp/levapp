---
id: classes.recurrence
status: implementing
depends_on: [classes.create]
serves: [P-CLASSES-2]
governed_by: []
---

# classes.recurrence


### Intent
Support recurring class schedules with configurable frequency and end dates.

### Rules
1. `recurrence_rule` is a JSON object: `{frequency: "weekly", daysOfWeek: [0-6], interval: N}`
2. `recurrence_end` is an optional Date that stops the series
3. Changing the day of a class updates `recurrence_rule.daysOfWeek` via `update_recurrence_weekday()`
4. Scheduler schedules reminder jobs for the next 60-day horizon
5. A daily job (`extend_schedule_window`, 02:47 UTC since B-667; daily since PAD-121) extends the horizon and re-derives missing lesson reminder jobs; every boot's startup reschedule does the same pass (delivery.worker-role rule 4)
6. **Series identity (PAD-275, audit M7; number self-assigned, unconfirmed; delivered by migration `f50214af74f1` (batch 7); existing lessons get `series_id = id`, historical forks are NOT reconnected).** Every lesson carries `series_id`, its own id at creation. A "this and future" edit forks the lesson through `split_lesson`; the fork copies **every** column of the template except id, timestamps and the recurrence bounds it changes (today `duplicate_lesson_helper` drops `description` and `notifications_enabled`), sets `series_id` to the root's, and the reminder jobs of the occurrences it takes over are **moved** to the new lesson id, not re-created (`move_lesson_reminder_jobs`, with `prune_lesson_reminder_jobs` dropping jobs for dates the series no longer produces — the pair ships together because the prune reads the excluded dates). A rename or roster change on one lesson of a series does not propagate to the others (that stays a future-scoped edit); `series_id` is what lets lists, stats and exports treat the forks as one class
7. **A single-occurrence delete is an exclusion, not a fork (PAD-275, M7; delivered by migration `f50214af74f1` (batch 7)).** `lessons.excluded_dates` is a JSON list of ISO dates. Deleting one occurrence of a recurring class appends its date and leaves the lesson row alone; `expand_occurrences` skips excluded dates; a materialised instance on that date is deleted as today (PAD-65's guarantee — it must not come back — holds through the exclusion instead of through the split). Until the column exists, the PAD-65 split stays
8. **An edit is committed before its jobs are scheduled (PAD-10).** A scheduler failure after a
   "this and future" edit, or on an occurrence with no coach, does not undo the edit or turn it into
   an error; rule 5's daily sweep re-derives what is missing.

### Acceptance Criteria

#### CLASSES-RECURRENCE-1: A fork keeps the series and takes its jobs with it (rule 6)
- **Given** a weekly class with reminder jobs armed for its next six occurrences
- **When** the coach edits "this and future" from the third occurrence, forking the lesson
- **Then** the fork's `series_id` is the root's id, and every column of the template (description, notifications flag) is on the fork
- **And** the jobs for the moved occurrences are keyed on the fork with the same fire times, and the job count is unchanged

#### CLASSES-RECURRENCE-2: Deleting one occurrence records an exclusion, not a fork (rule 7)
- **Given** a weekly class over six weeks and no instance row for its second week
- **When** the coach deletes the second occurrence with scope `single`
- **Then** the lesson count is unchanged and `excluded_dates` contains that date
- **And** the calendar shows the first and third occurrences and not the second, the scheduler arms no job for it, and a student's cancel or join request on that date is 404 with nothing materialised

#### CLASSES-RECURRENCE-3: The PAD-275 migration gives every class its own series and an override only where capacity differed (rules 6, 7)
- **Given** two classes with capacity 4, and three occurrences of which one holds capacity 6
- **When** the migration upgrades
- **Then** each class's `series_id` is its own id with no excluded dates, only the occurrence with 6 carries a capacity override, and the log carries the four counts
- **And** a second upgrade changes nothing, a backfill that leaves a class without a series refuses, and the downgrade keeps every row
test: `backend/padel_app/tests/test_pad275_migration.py` › `test_backfill_series_and_capacity_override_and_logs_its_counts` (+2 more)

#### CLASSES-RECURRENCE-4: A "this and future" edit that moves the date splits the series at the new date (rule 6)
- **Given** a weekly class with reminder jobs, edited from its third occurrence to start two weeks later
- **When** the edit is saved with scope `future`
- **Then** the occurrences between the edited one and the new date stay the parent's, with their reminder jobs
test: `backend/padel_app/tests/test_reminder_jobs_on_future_edit.py` › `test_moved_date_edit_keeps_the_parents_jobs_before_the_new_boundary` (+1 more)

#### CLASSES-RECURRENCE-5: The daily sweep re-derives missing reminder jobs, for future occurrences only (rules 4, 5)
- **Given** a weekly class with no reminder jobs, one starting tomorrow and one that started eight days ago
- **When** `extend_schedule_window` runs
- **Then** each has reminder jobs again, and none of them is for a date already past
test: `backend/padel_app/tests/test_reminder_jobs_on_future_edit.py` › `test_extend_schedule_window_re_derives_missing_reminder_jobs` (+1 more)

#### CLASSES-RECURRENCE-6: A scheduler failure does not fail an edit (rule 8)
- **Given** a weekly class, and the scheduler raising when jobs are scheduled
- **When** the coach saves a "this and future" edit
- **Then** the edit answers 201 and is committed
- **And** editing an occurrence that has no coach raises nothing
test: `backend/padel_app/tests/test_reminder_jobs_on_future_edit.py` › `test_future_edit_survives_a_scheduler_failure` (+1 more)
