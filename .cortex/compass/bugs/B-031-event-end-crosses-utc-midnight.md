---
id: B-031
title: "Classes crossing UTC midnight vanish from both dashboards; _event_end joins start date to end time"
type: missing-criterion
severity: medium
status: open
affects:
  - dashboard.blocks
  - backend/padel_app/helpers/dashboard/coach_home.py
  - backend/padel_app/helpers/dashboard/player_home.py
proposed_fix: "In _event_end, roll the end date forward one day when the end time is earlier than the start time; add a dashboard.blocks criterion and a pinned-clock test on both homes."
opened: 2026-09-10T00:00:00Z
---

# B-031 — Classes crossing UTC midnight vanish from both dashboards

**Source:** found while fixing PAD-253 (Session A, 2026-09-10). The needs-you snooze endpoint
test failed between 22:15 and 23:15 UTC, and the reason turned out to be this bug, not the snooze.

**What happens:** a class whose time span crosses UTC midnight disappears from every dashboard
block on both homes. That covers the coach hero, needs-you empty seats, next 7 days and week
pulse, and the student hero and schedule. In Lisbon summer time that is any class ending after
01:00 local; in winter, after 00:00.

**What should happen:** the class is on every block whose window it overlaps, like any other
class.

**Root cause:** `helpers/dashboard/coach_home.py` `_event_end` joins the event's START `date` to
its END `endTime`. The event strings are UTC (`tools/calendar_tools._format_date` /
`_format_time` just `strftime` the naive-UTC datetimes). For a 23:15–00:15 UTC class that gives
2026-08-04 00:15, before the class starts, and `load_events` drops it with
`_event_end(e) > start`. `load_events` feeds every block on both homes.

**Evidence (pinned clock, coach-home test seed):** at 2026-08-04 10:30 UTC `build_lesson_events`
and `load_events` both return the two upcoming classes. At 22:30 UTC `build_lesson_events` still
returns `lessoninstance-1 (2026-08-04, 23:15)`, but `load_events` returns only
`lessoninstance-2`.

**Scope note:** pure date arithmetic on the UTC strings the serializer already emits, so it
does not wait on the timezone decision (PAD-256).

**Linear:** could not be filed on 2026-09-10 (the workspace hit its free issue limit); this
entry is the record. Related: PAD-253, PAD-256.
