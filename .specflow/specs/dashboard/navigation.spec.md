---
id: dashboard.navigation
status: implemented
depends_on: [dashboard.blocks]
implements: ../../specs-business/dashboard/user-relies-on-the-dashboard.business.md
governed_by: []
---

# dashboard.navigation


### Intent
Dashboard blocks provide deep links to relevant pages for quick navigation.

### Rules
1. Each block item can have an `href` field linking to the detail page
2. Messages overview links to `/messages`
3. KPI items link to `/players`, `/calendar`, etc.
4. Class list items link to `/calendar` (with event selection)
5. Frontend route: `/` or `/dashboard`
6. `href` is optional on KPI items. It MUST only be set when a matching frontend route exists —
   a dashboard item must never link to a route that resolves to the 404 page
7. A KPI item without an `href` renders as a plain, non-interactive card: no button role, no
   pointer cursor, no click/keyboard navigation
8. Every `class_list` item `href` is a calendar DEEP LINK, not a bare `/calendar`. It carries both
   the calendar event id and the occurrence date:
   `/calendar?classId=<calendar-event-id>&date=<YYYY-MM-DD>`
   - `classId` is the same id the calendar endpoint emits for that occurrence (`lessoninstance-<id>`
     for a materialised instance, `lesson-<id>-<date>` for a virtual one), so the two surfaces
     always agree
   - `date` is required because a materialised instance id does not encode its own date, and an
     upcoming class often falls outside the currently displayed week
9. Rule 8 applies to every class-carrying item on every dashboard — `schedule_7d` rows,
   `next_class`, and the `empty_seats` / `invite` kinds of `needs_you` — for coach and student
   alike. **(PAD-202)** `class_list` no longer exists; the student's "Your upcoming lessons" is
   their `schedule_7d` and "Invites to confirm" is the `invite` kind of `needs_you`, and both
   keep the same deep-link shape.
9a. **(PAD-201, B-045)** The `validation` kind of `needs_you` links to the Presences tab —
    `/presences`, with `?week=<offset>` when the counted week is not the current one — and the
    tab honours `week` as its initial week. `/validations` never existed; rule 6 applies to queue
    items exactly as it does to KPI tiles.
10. Schedule rows and queue cards are keyboard reachable: each is exposed as a button and
    activates with Enter/Space, not only with a pointer click
11. The student "Attended" KPI links to the attendance history page (`href: /attendance`, see
    `attendance.history`). It is the student-side entry point to that page.
11a. **(PAD-141)** The student "Missed" KPI links to the absence history page
    (`href: /absences`, see `attendance.absences`), and is the student-side entry point to it.
    This **supersedes** the previous rule that "Missed" stays inert. That rule was never about
    "Missed" being undeserving of a destination — it was rule 6 applied to a route that did not
    exist yet (PAD-76). `attendance.absences` creates the route, so rule 6 is now *satisfied*
    rather than waived, and the same reasoning that gave "Attended" an `href` applies unchanged.

### Acceptance Criteria

#### KPI item with a destination
- **Given** an authenticated player on the dashboard
- **When** they click the "Upcoming lessons" KPI card (which has `href: /calendar`)
- **Then** they navigate to the calendar page

#### Attended KPI opens the attendance history
- **Given** an authenticated student on the dashboard
- **When** they click the "Attended" KPI card
- **Then** they navigate to `/attendance` and see their attendance history page

#### KPI item without a destination
- **Given** an authenticated player on the dashboard and a KPI for which no matching frontend
  route exists (today: "Invites" — there is no `/invites` page)
- **When** the dashboard renders that KPI card
- **Then** the card has no `href`, is not exposed as a button, and clicking it does not navigate
  anywhere (the player stays on the dashboard and never sees the 404 page)
- **Note (PAD-141)**: "Missed" was this criterion's example until `/absences` existed. The rule
  being tested is rule 6 ("only link where a route exists"), not anything specific to "Missed",
  so the example moved to the KPI that still has no route rather than the criterion being deleted.

#### Missed KPI opens the absence history (PAD-141)
- **Given** an authenticated student on the dashboard
- **When** they click the "Missed" KPI card
- **Then** they navigate to `/absences` and see their absence history page

#### Upcoming class opens that exact class
- **Given** an authenticated coach whose next scheduled class is on a day in a LATER week than the
  one the calendar shows by default
- **When** they click that class in the dashboard's "Upcoming classes" list
- **Then** they land on `/calendar`, the calendar is showing the week that contains the class, and
  the class detail sheet for that exact occurrence is already open — they never have to page
  through weeks or hunt for the event

#### Student upcoming lesson opens that exact class
- **Given** an authenticated student with an upcoming lesson
- **When** they click its row in "NEXT 7 DAYS"
- **Then** the calendar opens on that lesson's week with its detail sheet open

#### Student invite opens that exact class (PAD-202)
- **Given** an authenticated student with a pending invite in the "NEEDS YOU" queue
- **When** they activate the invite card's "Open" action
- **Then** the calendar opens on that class's week with its detail sheet open, where the
  student can confirm or decline
