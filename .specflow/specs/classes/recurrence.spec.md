---
id: classes.recurrence
status: implemented
depends_on: [classes.create]
implements: ../../specs-business/classes/coach-schedules-recurring-classes.business.md
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
5. A weekly job (`extend_schedule_window`) extends the horizon every 7 days
6. **Series identity (PAD-275, audit M7; number self-assigned, unconfirmed; column decided 2026-09-11, migration `f50214af74f1` in batch 7; existing lessons get `series_id = id`, historical forks are NOT reconnected).** Every lesson carries `series_id`, its own id at creation. A "this and future" edit forks the lesson through `split_lesson`; the fork copies **every** column of the template except id, timestamps and the recurrence bounds it changes (today `duplicate_lesson_helper` drops `description` and `notifications_enabled`), sets `series_id` to the root's, and the reminder jobs of the occurrences it takes over are **moved** to the new lesson id, not re-created. A rename or roster change on one lesson of a series does not propagate to the others (that stays a future-scoped edit); `series_id` is what lets lists, stats and exports treat the forks as one class
7. **A single-occurrence delete is an exclusion, not a fork (PAD-275, M7; HELD: the column and its migration wait for the owner's decisions 9–11 of the 2026-09-11 list).** `lessons.excluded_dates` is a JSON list of ISO dates. Deleting one occurrence of a recurring class appends its date and leaves the lesson row alone; `expand_occurrences` skips excluded dates; a materialised instance on that date is deleted as today (PAD-65's guarantee — it must not come back — holds through the exclusion instead of through the split). Until the column exists, the PAD-65 split stays
