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
