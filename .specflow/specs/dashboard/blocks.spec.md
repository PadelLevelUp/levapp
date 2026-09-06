---
id: dashboard.blocks
status: implemented
depends_on: [classes.instances, messaging.conversations, notifications.activity, players.list]
implements: ../../specs-business/dashboard/user-relies-on-the-dashboard.business.md
governed_by: []
---

# dashboard.blocks


### Intent
Render a server-driven dynamic dashboard with configurable blocks for coaches and players.

### Rules
1. `GET /api/app/dashboard?from=ISO&to=ISO` returns `DashboardDefinition`
2. Definition contains ordered `blocks[]`, each with a type
3. Block types. Both roles share ONE "home" block vocabulary since the coach redesign
   (`helpers/dashboard/coach_home.py`) and PAD-202 (`helpers/dashboard/player_home.py`):
   - `next_class`: the class about to start — title, ISO date, start/end time, `isToday`,
     `minutesUntil` (only when today and within two hours, else `null`), fill `filled`/`capacity`,
     a server-capped roster for the avatar stack, and a calendar deep link. **Omitted entirely**
     when nothing is scheduled in the next 90 days; there is no empty hero.
   - `needs_you`: an ordered queue of things the user can resolve, each item carrying its own
     `href`. `count` is `items.length`. Item kinds, in fixed server order:
     - coach: `empty_seats` (soonest first) → `reply` → `validation`
     - student: `invite` (soonest first) → `reply`
     A `reply` is one unread inbound message per conversation, most recent first, capped at 3.
     An `invite` (PAD-202) is a `Presence` row for the student with `invited = true`,
     `confirmed = false` on a `LessonInstance` that has not started, soonest first, capped at 5,
     carrying `classTitle`, ISO `date`, `timeLabel`, `filled`, `capacity` and the calendar deep link.
   - `schedule_7d`: the next 7 days, first 5 rows plus `totalCount`, each row with ISO `date`,
     `dayOfMonth`, `timeLabel`, `filled`/`capacity` and a deep link; `calendarHref` links out.
   - `week_pulse` (coach only): two metrics with denominators — seats filled this week and active
     players — never a third.
   - `kpi_grid` (student only): Attended / Missed / Upcoming lessons / Invites. Every item carries
     the context that gives the number meaning: `total` (attended + missed) on Attended and
     Missed, so the tile can read "12 · of 15 lessons"; Upcoming reads against the 30-day window;
     Invites reads "to confirm". `href` policy is `dashboard.navigation` rules 6–7.
   - `messages_overview`: unread count, conversations to reply, latest message, link. Emitted for
     every dashboard because the layout's unread badge feeds off it, but **rendered by neither
     home** — "Unread messages: 0" as the largest card on the screen is the flaw the redesign
     removed; an unread message reaches the user as a `reply` queue item instead.
   - **(PAD-167)** `notification_activity` and `pending_confirmations` were removed as dead.
   - **(PAD-202)** `class_list` and `grid` were removed. The student payload was the last emitter;
     the student's "Your upcoming lessons" is now `schedule_7d` and "Invites to confirm" is the
     `invite` kind of `needs_you`. The old "Invites to confirm" list could never populate: it
     filtered calendar events on `invited`/`confirmed` flags the calendar serializer does not emit
     (`helpers/dashboard/events.py`, deleted). The queue reads `Presence` directly, which is the
     same source the Invites KPI already counted, so the two can no longer disagree.
3a. **(PAD-202) Design language.** Coach and student homes are built from the SAME components on
   each shell (web `components/dashboard/coach/*`, iOS `features/dashboard/blocks.tsx`); they
   differ only in which blocks the server sends and how the desktop columns are arranged. The
   rules those components encode, so a role-specific screen never re-decides them:
   - No in-page "Dashboard" heading. The greeting ("Bom dia, {first name}") plus today's long
     date is the page's orientation — in the content on web, in the navy app bar on iOS. The
     sub-line appends "· {n} things need you" when the queue is non-empty.
   - Sections are introduced by an uppercase tracked eyebrow, never a heading element.
   - The hero is the only gradient and keeps its navy (`sidebar` token family) surface in both
     themes. Cards in lists use borders, never shadows; rows in a schedule sit in a 1px-gap group.
   - Amber means "needs you", green means "done"; no other status colour. A badge or accent
     appears only when it carries information — under-capacity rows get amber "{n} seats" /
     "Empty", full rows green "Full", nothing otherwise. A student's schedule rows carry NO
     capacity badge and a never-amber fill count: seats are the coach's problem, not the
     student's.
   - Every number ships with its denominator or context; every time, date and x/y count is
     tabular.
   - 44px touch targets on mobile; `sm` density is desktop-only.
   - Desktop (≥1024px) is a page header plus two columns: the work (queue, schedule) scrolling on
     the left, the context (hero, metrics) sticky on the right. Below that, one priority-ordered
     stack: hero → queue → schedule → metrics.
   - Copy ships in pt-PT (default, informal "tu") and en; dates are formatted client-side from
     ISO values in the active locale (`@levelup/config`), never from server-formatted strings.
3b. **(PAD-202)** The client tells the two homes apart by the payload `id`
   (`coach_default_v1` / `player_default_v1`), not by sniffing block types — both homes now share
   `next_class`, `needs_you` and `schedule_7d`.
4. Each shell renders the home by looking blocks up by type (`CoachDashboard`, `StudentDashboard`);
   an unknown block type is skipped, never fatal
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
- **Then** the response `id` is `player_default_v1` and its blocks are, in order,
  `messages_overview`, `next_class`, `needs_you`, `schedule_7d`, `kpi_grid` — no `class_list`,
  no `grid` — and `schedule_7d` lists both classes

#### Student invite reaches the queue (PAD-202)
- **Given** an authenticated student with a `Presence` on tomorrow's 18:00 class where
  `invited = true` and `confirmed = false`, and a confirmed presence on a class the day after
- **When** they GET `/api/app/dashboard`
- **Then** `needs_you.count` is 1 and its single item has `kind: "invite"`, the class title,
  tomorrow's ISO date, `timeLabel: "18:00"` and a `/calendar?classId=…&date=…` href; the
  confirmed class is absent from the queue

#### Student hero is the soonest class (PAD-202)
- **Given** an authenticated student whose next class starts in 45 minutes
- **When** they GET `/api/app/dashboard`
- **Then** `next_class.data.isToday` is `true`, `minutesUntil` is 45 and `players` lists the
  signed-up classmates (capped at 2)

#### Student with nothing scheduled has no hero (PAD-202)
- **Given** an authenticated student with no upcoming class in the next 90 days
- **When** they GET `/api/app/dashboard`
- **Then** no `next_class` block is present, `schedule_7d.totalCount` is 0 and `needs_you.count`
  is 0

#### Student KPIs carry their denominator (PAD-202)
- **Given** an authenticated student with 12 attended and 3 missed presences
- **When** they GET `/api/app/dashboard`
- **Then** the `kpi_grid` Attended item is `{ value: 12, total: 15 }` and Missed is
  `{ value: 3, total: 15 }`, with the `href` values of `dashboard.navigation` rules 11 / 11a
  unchanged

#### Student dashboard renders the shared design language (PAD-202)
- **Given** the seeded `e2e-student` on a 1280px viewport
- **When** they open `/`
- **Then** the page shows a greeting heading (no "Dashboard"/"Painel" heading), the navy
  "next class" hero, the "NEEDS YOU" and "NEXT 7 DAYS" eyebrows and the KPI tiles with their
  denominators; and the same locators the coach home exposes (`dashboard-next-class`,
  `dashboard-needs-you`, `dashboard-schedule`) are present under `student-dashboard`
