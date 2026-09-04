---
id: calendar.view
status: implemented
depends_on: [classes.instances]
implements: ../../specs-business/calendar/coach-views-and-manages-schedule.business.md
governed_by: []
---

# calendar.view


### Intent
Display a unified calendar view showing lesson instances, calendar blocks, and availability for the current user.

> **Forward-looking rules:** the open-spot clauses of rules 4 and 6 are **not built** — they are
> specced ahead of PAD-130. Everything else in this spec is implemented. Rules added ahead of their
> ticket are marked inline.

### Rules
1. `GET /api/app/calendar?from=ISO&to=ISO` returns events in date range
2. Events include both lesson instances (materialized + virtual from recurrence) and calendar blocks
3. For coaches: shows all classes they teach + personal blocks
4. For players: shows classes they're enrolled in. **(pending PAD-130)** plus future classes with an
   empty spot that the player is eligible for and whose coach has made open spots visible — see
   `eligibility.open-spot-visibility` for the full conditions. With the visibility toggle off, or
   with no such class, this is exactly rule 4 as it has always been: enrolled classes only
5. Frontend renders week view (7-day grid) with `useCalendar` hook
6. Events are color-coded: academy classes, private classes, calendar block types. **(pending
   PAD-130)** an **open-spot class a player is not enrolled in uses a distinct colour** from that
   player's own classes — the two must never be mistaken for each other, since one is a commitment
   and the other is an offer
7. Mobile-responsive: `MobileCalendarView` for small screens
8. Class events expose `participantCount` / `maxPlayers`, rendered on the event card as `X/Y`. `participantCount` is the **effective filled spots** for the instance, NOT the raw enrolment count: enrolled players minus those whose presence status is `absent` (declined the invite or cancelled), floored at 0. Players who have not yet responded still count toward `X`
9. Effective filled spots is computed in exactly one place — `LessonInstance.effective_filled_spots` on the backend model — and is the single source of truth shared by the calendar event card, the class-detail "capacity" field (calendar.event-detail), and the invitation engine's capacity checks (notifications.invitation-engine). No surface recomputes it independently
10. Lesson templates (non-materialized recurrence occurrences with no instance row) have no presences, so their `participantCount` is the enrolment count
11. Each event exposes a `status` of `completed` or `scheduled`. An event is `completed` once its **end datetime has passed** (compared against the current time), otherwise `scheduled`. The comparison uses the real end datetime — the event's date combined with its end time-of-day — NOT just the date. So a class that ended earlier **today** reads as `completed`, exactly like classes on previous days. For recurrence occurrences the end datetime is the occurrence date combined with the template's end time-of-day. "Now" uses the same naive-UTC clock (`utcnow_naive`) the scheduler uses to compare class datetimes
12. The week-range label (`useCalendar`'s `weekLabel`) is rendered in the **active UI language**, not a hardcoded English locale: month abbreviations follow the coach's `users.language` preference on web and on iOS alike (`pt` → "31 ago–6 set", `en` → "31 Aug–6 Sep"). `useCalendar` lives in `@levelup/hooks`, which must stay platform-neutral (no React DOM, no React Native, no Expo import), so the shell passes its active language in (`options.language`) and the hook derives the label from it. The language→`date-fns` `Locale` mapping lives in exactly one place, `resolveDateLocale` in `@levelup/config`, shared by both shells and by the hook; the fallback stays `pt` per settings.language rule 4. The label is *derived* from the stored language on every render, never frozen into state, so switching language in Settings re-renders it without a reload

### Acceptance Criteria

#### Coach calendar view
- **Given** a coach with 3 classes this week and 1 calendar block
- **When** they GET `/api/app/calendar?from=2026-04-13&to=2026-04-19`
- **Then** the response includes all 3 class events and the calendar block
- **And** each event has: id, type, model, originalId, title, date, startTime, endTime, color

#### Player calendar view
- **Given** a player enrolled in 2 classes this week
- **When** they GET `/api/app/calendar?from=2026-04-13&to=2026-04-19`
- **Then** only their enrolled classes appear
- **(pending PAD-130)** once open-spot visibility ships, this criterion holds for a coach whose
  visibility toggle is off; the visible case is covered by `eligibility.open-spot-visibility`

#### Declined students do not count toward the calendar participant count
- **Given** a class instance with 6 enrolled players, `maxPlayers` 6, of which 3 have a presence with status `absent` (declined)
- **When** the coach loads the weekly calendar
- **Then** the event card shows `3/6`
- **And** the same `3/6` appears in the "capacity" field of that class's detail sheet

#### Unanswered invites still count
- **Given** a class instance with 4 enrolled players, none of whom has responded
- **When** the coach loads the weekly calendar
- **Then** the event card shows `4/<maxPlayers>`

#### Today's already-ended class is completed
- **Given** a class today whose end time was 90 minutes ago
- **When** the coach loads the weekly calendar
- **Then** that event's `status` is `completed`
- **And** a class today that has not yet ended has `status` `scheduled`
- **And** a class on a previous day has `status` `completed`

#### Week-range label follows the coach's language
- **Given** a coach whose `language` is `pt` viewing the week of 31 August 2026
- **When** they open the calendar on web or on iOS
- **Then** the week-range label reads "31 ago–6 set"
- **And** with `language` `en` the same week reads "31 Aug–6 Sep"
- **And** switching the language in Settings re-renders the label without a page reload
