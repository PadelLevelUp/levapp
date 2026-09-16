# calendar

## What this is

Business outcomes for the calendar domain: the coach's unified schedule view, personal and
student availability blocking, and season-bounded recurrence.

## What it covers

- `calendar.coach-views-and-manages-schedule` — the coach's weekly view (day / week / month on
  a phone), event detail, drag to reschedule, and click/drag-to-create.
- `calendar.coach-blocks-personal-time` — a coach marking out their own breaks, holidays, and
  personal time.
- `calendar.student-controls-invitation-availability` — a student marking themself unavailable so
  the invitation engine (and, when fully shipped, the coach) leaves them alone during that window.
- `calendar.coach-plans-classes-within-seasons` — named seasons that bound "recurs until season
  end" recurrence and stay overlap-free.

## Why it's grouped this way

`blocks` and `student-blockers` share an underlying record type (`CalendarBlock`) but are kept
as separate outcomes because they serve different personas with different purposes — a coach's
own time off versus a student's protection from unwanted invitations. `seasons` stands alone
because it is a distinct settings-driven capability that only intersects the coach's schedule
view through the recurrence it bounds.
