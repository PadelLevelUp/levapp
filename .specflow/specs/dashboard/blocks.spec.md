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
     A `validation` item (PAD-190 / PAD-201, B-031) carries `count` — the number of **classes**
     with at least one unvalidated presence, derived by `attendance.validation` rule 18's
     `count_pending_validation` for one Monday–Sunday UTC week — plus `weekOffset` (`0` for the
     current week, `-1` for the previous) and `href` (`/presences` or `/presences?week=-1`). The
     server counts the current week first and falls back to the previous week when the current
     one has nothing pending, so a Monday-morning coach still sees the weekend's backlog. The
     item is omitted when both weeks are clean. Both shells open the Presences tab **on that
     week**, and the tab's own trigger reads the same endpoint for the same bounds, so the two
     numbers are one number.
     - student: the **asks** — `invite`, `vacancy_invite`, `waiting_list_offer` — merged and
       ordered soonest class first, together capped at 5 → `reply`
     A `reply` is one unread inbound message per conversation, most recent first, capped at 3.
     An `invite` (PAD-202) is a `Presence` row for the student with `invited = true`,
     `confirmed = false` on a `LessonInstance` that has not started, soonest first, capped at 5,
     carrying `classTitle`, ISO `date`, `timeLabel`, `filled`, `capacity` and the calendar deep link.
     **(PAD-236) The other two asks come from the messaging layer, not from `Presence`:**
     - a `vacancy_invite` is an open `NotificationEvent` (`status = sent`) for the student on a
       class that has not started — the engine's "a spot opened, want it?" (`notifications.
       invitations`). It carries `notificationEventId` (the answer goes through
       `POST /app/notify/respond`, exactly as the chat bubble's Yes/No does), `lessonInstanceId`,
       `classTitle`, `date`, `timeLabel`, `filled`, `capacity`, `href`.
     - a `waiting_list_offer` is an un-answered `waiting_list_offer` message to the student
       (`notifications.waiting-list` rule 1) for a class that has not started. It carries
       `lessonInstanceId` (the answer goes through `POST /app/notify/respond_waiting_list`),
       `classTitle`, `date`, `timeLabel`, `href`.
     Both are **deduplicated against the chat bubble's own state**: an item exists only while the
     message's `metadata.responded` is falsy, and answering from the dashboard settles the bubble
     the same way answering in the chat does (`respond_to_notification` /
     `respond_to_waiting_list` write `responded` + `response` back onto the message), so the same
     question is never open in two places. One item per class: several invite rounds for the same
     class collapse to the newest event. Both shells render Yes / No on these cards with the
     same outcomes the bubble reports (spot filled → the "just filled" notice; expired → the
     "already started" notice) and refetch the dashboard so the card leaves because the payload
     says so.
     **(B-030) "Later" on an `empty_seats` card is a real action, not decoration.**
     `POST /api/app/dashboard/needs-you/<itemId>/snooze` (coach only, else 403; `itemId` must be a
     queue item id — `lessoninstance-<pk>` or `lesson-<pk>-<date>` — else 400) records a per-coach
     snooze for that occurrence, **24 hours** from now, and answers `{ itemId, snoozedUntil }`.
     While a snooze is live the occurrence is left out of `empty_seats` and out of `count`; it is
     still on `schedule_7d` and the calendar — only the nag is paused. The snooze is stored
     server-side (`needs_you_snoozes`, unique per coach + item) so web and iOS show the same queue;
     it lapses on its own and is never swept. Snoozing again restarts the 24 hours rather than
     stacking. Both shells disable the button while the request is in flight, refetch the
     dashboard on success (the card leaves because the payload says so), and toast on failure.
   - `schedule_7d`: the upcoming classes, first 5 rows plus `totalCount`, each row with ISO `date`,
     `dayOfMonth`, `timeLabel`, `filled`/`capacity` and a deep link; `calendarHref` links out.
     The window is role-specific: the coach sees the **next 7 days** (their week is dense); the
     student sees the **next 30 days** (PAD-202 correction — a student with one class a week
     otherwise met an empty section), the same window the dashboard fetch already asks for.
     **Student rows and the student hero also carry `lessonInstanceId` (materialised instances
     only, else `null`) and `pendingConfirmation`** — `true` when the student's `Presence` on that
     instance is `invited` and not yet `confirmed`, i.e. they have been asked to confirm and have
     not answered (both answers set `confirmed`, see `notifications.reminders`).
   - `week_pulse` (coach only): two metrics with denominators — seats filled this week and active
     players — never a third.
   - `kpi_grid` (student only): Attended / Missed / Upcoming lessons / Invites. Every item carries
     the context that gives the number meaning: `total` (attended + missed) on Attended and
     Missed, so the tile can read "12 · of 15 lessons"; Upcoming reads against the 30-day window;
     Invites reads "to confirm". `href` policy is `dashboard.navigation` rules 6–7.
     **(PAD-235, B-032) "Upcoming lessons" is the schedule's number.** Its `value` is the count
     of scheduled classes the student is enrolled in (signed up, or holding a `Presence`) over
     the same 30-day window `schedule_7d` lists, derived from the **same event load** — so the
     tile can never read 0 above a populated list. It is NOT the count of confirmed presences:
     a student with three unanswered reminders has three upcoming lessons, not zero. "How many
     of those still need an answer" is the `invite` kind of `needs_you`, and the Invites tile.
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
   - **(PAD-202 correction) A student answers where they see the class.** A schedule row, the hero
     and the queue's invite card with `pendingConfirmation` show **Yes / No** (the same two
     answers the reminder message offers), which call `POST /app/notify/respond_reminder` with the
     row's `lessonInstanceId`; the answer is recorded exactly as if given in the chat
     (`notifications.reminders` rules 4–6, 10–12), the dashboard refetches so the buttons
     disappear and the queue count drops, and the reminder message is marked read
     (`notifications.reminders` rule 13) so the unread badge falls with it. A row without
     `pendingConfirmation` has no buttons. Nothing about a *coach's* rows changes.
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

8. **(PAD-262, audit H9) One pipeline call per paint, scoped in SQL.** The coach home loads its
   classes ONCE — one calendar-pipeline call over the widest window any block needs (from a week
   before the current week to the hero's 90-day horizon) — and every block cuts its own window
   from that set; the blocks' output is identical to loading each window separately. The
   instance loader filters by coach in SQL (the instance's own coach junction, or the lesson's
   when the instance has none) and eager-loads the lesson, its coaches, the instance's coaches,
   enrolments and presences, so a window costs a fixed number of statements however many
   classes it holds and never touches another coach's rows. The replies queue asks the database
   for the newest unread message per conversation, capped at the queue limit, instead of every
   unread message.

### Acceptance Criteria

#### Coach dashboard
- **Given** an authenticated coach with 15 players, 3 classes this week, 2 unread messages
- **When** they GET `/api/app/dashboard`
- **Then** the response includes blocks: messages_overview (2 unread), kpi_grid (15 players), class_list (3 classes)

- **Given** an authenticated coach whose queue lists an `empty_seats` item for class B1 (2 of 6
  seats taken, starting in 45 minutes) and a validation item
- **When** they POST `/api/app/dashboard/needs-you/<B1 item id>/snooze` and GET `/api/app/dashboard`
- **Then** the POST answers 200 with `snoozedUntil` 24 hours ahead, and the queue now lists only
  the validation item with `count` one lower

- **Given** a coach who snoozed an item 23 hours 59 minutes ago
- **When** the queue is built now, and again two minutes later
- **Then** the item is absent the first time and present the second

- **Given** a coach who snoozed an item, and a second coach who did not
- **When** the second coach's queue is built
- **Then** their `empty_seats` item is unaffected — a snooze is the snoozing coach's own

- **Given** a student, or a coach with an `itemId` that is not a queue item id
- **When** they POST `/api/app/dashboard/needs-you/<itemId>/snooze`
- **Then** the student gets 403 and the malformed id gets 400; nothing is stored

- **Given** the seeded `e2e-coach` on the dashboard with an under-capacity class in the next 7 days
- **When** they press **Later** on that card
- **Then** the card is gone after the dashboard refetches and the "needs you" count drops by one

#### Validation card counts classes for the tab's week (PAD-190 / PAD-201)
- **Given** a coach with two classes ended last week that still have an unvalidated presence,
  and nothing ended this week
- **When** they GET `/api/app/dashboard`
- **Then** the queue's `validation` item has `count: 2`, `weekOffset: -1` and
  `href: "/presences?week=-1"`, and `GET /api/app/class_instances/pending_validation/count`
  for last week's Monday–Sunday bounds answers `pendingCount: 2`

- **Given** a coach with one such class this week and two last week
- **When** they GET `/api/app/dashboard`
- **Then** the item has `count: 1`, `weekOffset: 0` and `href: "/presences"` — the current week
  wins whenever it has work

- **Given** a coach whose only unvalidated class ended three weeks ago
- **When** they GET `/api/app/dashboard`
- **Then** there is no `validation` item

- **Given** the seeded `e2e-coach` on the dashboard
- **When** they press **Review** on the validation card
- **Then** they land on `/presences` (never the 404 page) and the tab's trigger shows the same
  number of classes the card showed

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

#### Vacancy invitations and waiting-list offers reach the queue (PAD-236)
- **Given** an authenticated student with an open (`sent`) `NotificationEvent` for a class in
  three days they are not enrolled in, an un-answered `waiting_list_offer` message for a class in
  four days, and a reminder invite for tomorrow
- **When** they GET `/api/app/dashboard`
- **Then** `needs_you.items` are, in order, the `invite` (tomorrow), the `vacancy_invite`
  (`notificationEventId` set, `filled`/`capacity` present) and the `waiting_list_offer`
  (`lessonInstanceId` set), and `count` is 3

- **Given** the same student after answering the vacancy invite in the chat (its message
  carries `responded: true`) and a second `sent` event for the same class from a later round
- **When** they GET `/api/app/dashboard`
- **Then** no `vacancy_invite` for that class is listed

- **Given** a `waiting_list_offer` for a class that already started
- **When** the queue is built
- **Then** it is absent

- **Given** the seeded `e2e-student` with a real `waiting_list_offer` for "E2E Academy Class"
  (sent through the engine's own path)
- **When** they open `/` and press **Yes** on that card
- **Then** the card is gone after the dashboard refetches, the queue count drops by one, and the
  offer message in the chat shows the "on the waiting list" state

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

#### Upcoming lessons is the schedule's count (PAD-235)
- **Given** an authenticated student signed up to one class in 45 minutes, invited-but-unanswered
  on tomorrow's class, confirmed on the day after's, and confirmed on one in 12 days
- **When** they GET `/api/app/dashboard`
- **Then** the `kpi_grid` "Upcoming lessons" item has `value: 4` — equal to
  `schedule_7d.totalCount` — not the 2 confirmed ones

- **Given** the seeded `e2e-student` on the dashboard
- **When** the page renders
- **Then** the number on the "Upcoming lessons" tile equals the `totalCount` of the
  `schedule_7d` block in the same payload

#### Student answers a reminder from the dashboard (PAD-202 correction)
- **Given** the seeded `e2e-student` with a reminder sent for a class in two days (`Presence`
  invited, not confirmed) and an unread reminder message
- **When** they open `/` and press **Yes** on that class's row in the upcoming list
- **Then** their `Presence.confirmed` is `true`, the row shows no Yes/No, the queue count drops by
  one, and the dashboard's `messages_overview.unreadMessages` is lower than before

#### Student sees classes beyond the coming week (PAD-202 correction)
- **Given** an authenticated student whose only class is in 12 days
- **When** they GET `/api/app/dashboard`
- **Then** `schedule_7d.totalCount` is 1 and the class is listed with `pendingConfirmation: false`

#### Student dashboard renders the shared design language (PAD-202)
- **Given** the seeded `e2e-student` on a 1280px viewport
- **When** they open `/`
- **Then** the page shows a greeting heading (no "Dashboard"/"Painel" heading), the navy
  "next class" hero, the "NEEDS YOU" and "NEXT 7 DAYS" eyebrows and the KPI tiles with their
  denominators; and the same locators the coach home exposes (`dashboard-next-class`,
  `dashboard-needs-you`, `dashboard-schedule`) are present under `student-dashboard`
