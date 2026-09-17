---
id: classes.availability
status: draft
depends_on: [classes.class-requests, calendar.student-blockers, settings.coach-working-hours, classes.instances]
implements: ../../specs-business/classes/student-books-a-class.business.md
governed_by: []
---

# classes.availability

### Intent
One computation of "when is a private class possible" for a coach and a set of people, shared
by web and iOS through one pure module and one endpoint, so the two shells cannot disagree
(PAD-357). The sibling ticket (PAD-358) hangs its academy-class eligibility filter on the same
module.

### Entities
- **READS:** Coach (`working_hours`, `settings.coach-working-hours`), LessonInstance and Lesson
  occurrences (the coach's and each person's classes, via `Presence` for a person), CalendarBlock
  (the coach's blocks incl. request holds; each person's `unavailable` blocks,
  `calendar.student-blockers`), Association_CoachPlayer (the roster).
- **WRITES:** nothing.

### Rules
1. **The module is pure and shared.** `packages/config/src/availability.ts` exports:
   - `subtractIntervals(windows, busy)` → the windows minus the busy intervals (half-open, minutes);
   - `freeWindowsForDay({working, busy: [...per person...]}, {minMinutes})` → the coach's working
     windows for that weekday minus every busy interval of everyone, dropping windows shorter than
     `minMinutes` (30);
   - `weeklyIntersection(freeWindowsByDate, {weekdays, startDate, endDate})` → the windows free on
     **every** occurrence date of the recurrence (`weekdays` 1..7, Monday = 1), and the list of
     occurrence dates it considered;
   - `slotStarts(windows, durationMin, stepMin = 30)` → the start times a class of `durationMin`
     fits in (reuses `slotOptions`, `class-request-slots.ts`);
   - `DEFAULT_WORKING_WINDOW = {startTime: "08:00", endTime: "22:00"}` and
     `workingWindowsFor(workingHours, weekday)` → the coach's windows for a weekday, or the default
     when `workingHours` is null or has no entry for that day.
   Unit-tested on its own: single day, a busy invitee, a recurring block, the weekly intersection
   dropping a week with a clash, a window shorter than the duration.
2. **The endpoint serves what the module needs, privacy kept.**
   `GET /app/availability?coachId=<id>&from=YYYY-MM-DD&to=YYYY-MM-DD&participants=<u1,u2>`
   (student only; the coach must be on the caller's roster, else 403; `to − from` ≤ 62 days) answers
   `{coachId, from, to, workingHours, workingHoursSource: "coach" | "default",
   participants: [...rule 12 shape...], freeWindows: {"YYYY-MM-DD": [{startTime, endTime}]}}`.
   `freeWindows` is computed server-side as working time − the coach's occurrences, blocks and
   other requests' holds − the requester's and every valid invitee's occurrences and `unavailable`
   blocks (recurring ones expanded, `CLUB_TZ`), in club wall-clock `HH:MM`, windows ≥ 30 min,
   today's from the next quarter hour, days before today omitted. **Nobody's busy intervals are
   returned** — only the resulting windows — so an invitee's classes and blocks stay their private
   calendar (`calendar.student-blockers` privacy posture). If any participant fails rule 12, the
   answer is `400 INVALID_PARTICIPANTS` with the `participants` array, and no windows.
3. **The shells derive, never recompute privately.** Web and iOS render `freeWindows` through the
   module: `slotStarts` for a single class; `weeklyIntersection` then `slotStarts` for a weekly
   one. They show `workingHoursSource: "default"` as the assumption "horário de trabalho não
   definido: 08:00–22:00". The server re-derives the same arithmetic when the request is submitted
   (`classes.class-requests` rule 13).
4. **Additive only.** Nothing existing changes shape; old App Store builds never call this.

### Acceptance Criteria

#### Free windows are working time minus everyone's calendars
- **Given** coach Ana works Tue 09:00–13:00 and 15:00–21:00, has a class Tue 10:00–11:00 and a hold 16:00–17:00, Bruno (requester) has a class 12:00–13:00 and Carla (invitee) an `unavailable` block every Tue 19:00–21:00
- **When** Bruno asks `GET /app/availability?coachId=ana&from=<Tue>&to=<Tue>&participants=carla`
- **Then** `freeWindows[<Tue>]` is 09:00–10:00, 11:00–12:00, 15:00–16:00 and 17:00–19:00, `workingHoursSource` is `coach`, and no busy interval of Bruno's or Carla's appears anywhere in the answer

#### The default window applies until the coach sets hours
- **Given** a coach with `working_hours` null and an empty calendar on a day
- **When** their student asks that day's availability
- **Then** `freeWindows[day]` is 08:00–22:00 (today: from the next quarter hour) and `workingHoursSource` is `default`

#### The weekly intersection keeps only times free every week
- **Given** free windows Tue 18:00–20:00 in weeks 1, 2 and 3 but Tue 18:00–18:30 taken in week 2, and Thu 18:00–20:00 every week
- **When** the module intersects for `weekdays [2, 4]` over the three weeks
- **Then** the common windows are 18:30–20:00 (Tue+Thu), and `slotStarts` for 60 min offers 18:30 and 19:00 only

#### A stranger's calendar is not consulted and not exposed
- **Given** Bruno names "diogo", who does not train with Ana
- **When** Bruno asks availability with `participants=diogo`
- **Then** the answer is `400 INVALID_PARTICIPANTS` with `{username: "diogo", ok: false, code: "USERNAME_NOT_FOUND"}` and no `freeWindows`
