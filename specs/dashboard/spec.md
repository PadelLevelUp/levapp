# dashboard — Dynamic Dashboard

## dashboard.blocks

---
id: dashboard.blocks
status: implemented
depends_on: [classes.instances, messaging.conversations, notifications.activity, players.list]
---

### Intent
Render a server-driven dynamic dashboard with configurable blocks for coaches and players.

### Rules
1. `GET /api/app/dashboard?from=ISO&to=ISO` returns `DashboardDefinition`
2. Definition contains ordered `blocks[]`, each with a type
3. Block types:
   - `messages_overview`: unread count, conversations to reply, latest message, link to messages
   - `kpi_grid`: 4-item grid (total players, weekly classes, attendance rate, etc.)
   - `class_list`: upcoming classes with title, date, time, color, participant count
   - `notification_activity`: recent notification events
   - `grid`: layout container with responsive columns and child blocks
4. Frontend `DashboardRenderer` switches on block type
5. Coach and player get different dashboard payloads
6. **(PAD-144)** The coach's *pending confirmations* set covers **tomorrow's** classes, where
   "tomorrow" is the next **club-local calendar day** (`Europe/Lisbon`) — the day the coach sees on
   their own calendar, consistent with `calendar` rule 6 and `notifications.config` rule 6b. The
   half-open `[start, end)` window must be derived in club-local time and converted back to naive
   UTC to compare against `LessonInstance.start_datetime` (stored naive UTC). A bare
   `.replace(hour=0, ...)` on a naive-UTC instant pins the window to UTC midnight, which in
   Portuguese summer time shifts it an hour: a class at 00:30 local tomorrow is excluded while one
   at 00:30 local *today* is wrongly included.
7. **(PAD-144)** Rule 6 governs more than a count. The same window selects the targets of
   `notify_pending_confirmations`, which actually **sends** messages, so a misaligned boundary does
   not merely misreport a number — it nudges the wrong students about the wrong day's classes.

### Acceptance Criteria

#### Coach dashboard
- **Given** an authenticated coach with 15 players, 3 classes this week, 2 unread messages
- **When** they GET `/api/app/dashboard`
- **Then** the response includes blocks: messages_overview (2 unread), kpi_grid (15 players), class_list (3 classes)

#### Player dashboard
- **Given** an authenticated player enrolled in 2 classes this week
- **When** they GET `/api/app/dashboard`
- **Then** the response includes their enrolled classes

---

## dashboard.navigation

---
id: dashboard.navigation
status: implemented
depends_on: [dashboard.blocks]
---

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
9. Rule 8 applies to every `class_list` block on every dashboard — coach ("Upcoming classes",
   "Needs players") and player/student ("Your upcoming lessons", "Invites to confirm") alike
10. `class_list` items are keyboard reachable: each row is exposed as a button and activates with
    Enter/Space, not only with a pointer click
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
- **When** they click it in "Your upcoming lessons"
- **Then** the calendar opens on that lesson's week with its detail sheet open
