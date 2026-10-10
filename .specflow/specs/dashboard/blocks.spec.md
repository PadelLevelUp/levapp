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
     `minutesUntil` (only when today and within two hours, else `null`; both on the club's clock, PAD-256), fill `filled`/`capacity`,
     a server-capped roster for the avatar stack, and a calendar deep link. **Omitted entirely**
     when nothing is scheduled in the next 90 days; there is no empty hero.
   - `needs_you`: an ordered queue of things the user can resolve, each item carrying its own
     `href`. `count` is `items.length`. Item kinds, in fixed server order:
     - coach: `empty_seats` (soonest first) → `reply` → `validation`
     A `validation` item (PAD-190 / PAD-201, B-045; amended by PAD-539) carries `count` — the
     number of **classes** with at least one unvalidated presence, the coach's whole backlog as
     `attendance.validation` rule 18 defines it (`count_pending_validation_total`, no lower bound
     on the date) — plus `weekOffset` (the most recent week that has something pending: `0` for
     the current week, negative for earlier ones) and `href` (`/presences?validate=1` or
     `/presences?validate=1&week=<offset>`). The item is omitted when nothing is pending. Before
     PAD-539 it counted one Monday–Sunday week (the current, else the previous) and was omitted
     when both were clean, however many older classes waited. Both shells open the Presences tab
     **on that week, inside the validate view** (rule 10), and the tab's own trigger reads the
     same total, so the two numbers are one number.
     - student: the **asks** — `invite`, `vacancy_invite`, `waiting_list_offer` — merged and
       ordered soonest class first, together capped at 5 → `reply`
     A `reply` is one unread inbound message per conversation, most recent first, capped at 3.
     An `invite` (PAD-202) is a class the student has been **asked** to confirm and has not
     answered — `attendance.confirm` rule 27's `pendingConfirmation` (PAD-570), computed by the
     same server predicate as the rows below; before PAD-570 it read `invited = true`,
     `confirmed = false`, which `enrol()` writes at enrolment (B-441) — on a `LessonInstance`
     that has not started, soonest first, capped at 5,
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
     **(PAD-424, B-204)** The card's "Convidar x jogadores" / "Mais tarde" pair wraps onto a
     second line when the card is too narrow (desktop with the sidebar open); no button ever
     leaves the card.
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
     only, else `null`), `pendingConfirmation`, `attendanceState` and `declineTarget`** —
     `pendingConfirmation` is `attendance.confirm` rule 27's predicate (PAD-570): the student has
     been asked (the first-reminder instant has passed or a reminder was sent to them), the
     class would ask (coach engine on, occurrence notifications on), their `attendanceState` is
     `planned` and the class has not started. Before PAD-570 it read `invited` and not
     `confirmed`, which is true from enrolment (B-441). `attendanceState` is the student's own
     one word (`attendance.presence` rule 9; `planned` when the occurrence has no row yet) and
     `declineTarget` is `{model, originalId, date}` for `cancel_attendance`, so a projected
     occurrence can be declined from the row (`attendance.confirm` rules 18–20).
   - `week_pulse` (coach only): two metrics with denominators — seats filled this week and active
     players — never a third. A deleted account is not counted as a player, in the count or the
     denominator (`auth.account-deletion` rule 8).
   - `kpi_grid` (student only): Attended / Missed / Upcoming lessons / Invites. Every item carries
     the context that gives the number meaning: `total` (attended + missed) on Attended and
     Missed, so the tile can read "12 · of 15 lessons"; Upcoming reads against the 30-day window;
     Invites reads "to confirm" and counts the classes whose `pendingConfirmation` is `true`
     (PAD-570) — the same predicate as the queue, never a raw `invited` count. `href` policy is
     `dashboard.navigation` rules 6–7.
   - `evaluations` (student only, **PAD-402**): `{cards: [Card]}` — the newest **3** shared
     evaluation cards (`evaluations.sharing` rule 3's `Card`, served from the stored snapshot),
     newest `sharedAt` first, plus the way to the full list (`href: /evaluations`). Appended
     **after** `kpi_grid`. **Omitted from the payload** when the player has no shared card —
     never an empty block — and emitted **only when the request declares `evaluations`** in
     `X-LevApp-Capabilities` (`evaluations.student-view` rule 5; fails closed). Every other block
     is byte-identical with and without the header.
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
   **(PAD-486, PAD-490)** Two more top-level types, defined in `dashboard.profile-completeness`:
   `incomplete_players` (coach, after `needs_you`) and `profile_incomplete` (student, before the
   hero). Each is omitted entirely when empty and is unknown to builds before them, which skip it.
3a. **(PAD-202) Design language.** Coach and student homes are built from the SAME components on
   each shell (web `components/dashboard/coach/*`, iOS `features/dashboard/blocks.tsx`); they
   differ only in which blocks the server sends and how the desktop columns are arranged. The
   rules those components encode, so a role-specific screen never re-decides them:
   - No in-page "Dashboard" heading. The greeting ("Bom dia / Boa tarde / Boa noite, {first name}";
     English "Good morning / Good afternoon / Good evening, {first name}", PAD-419) plus today's long
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
     (`notifications.reminders` rule 13) so the unread badge falls with it. **(PAD-570,
     `attendance.confirm` rules 27–28)** A row, the hero or the invite card shows Yes / No only
     while `pendingConfirmation` is `true`. Without it, a row whose `attendanceState` is
     `planned` or `coming` on a class that has not started shows ONE outline button, "Avisar que
     não vou" (`dashboard.answer.notGoing`; the ticket's own words for the dashboard), which
     confirms in a dialog and calls `POST /app/notify/cancel_attendance` with the row's
     `lessonInstanceId` or `declineTarget`, so the server classifies the decline (rule 11); the
     hero shows the same. A row whose state is `not_coming` shows no button and the one-line hint
     "Respondeste que não vais. Se mudares de ideias, fala com o teu treinador."
     (`calendar.detail.declinedFinalHint`); the chat shortcut itself lives on the class detail,
     which the row opens (`attendance.confirm` rule 28). A class with reminders off is never in "Precisa de
     ti" and never shows Yes / No. Nothing about a *coach's* rows changes.
   - Every number ships with its denominator or context; every time, date and x/y count is
     tabular.
   - 44px touch targets on mobile; `sm` density is desktop-only.
   - Desktop (≥1024px) is a page header plus two columns: the work (queue, schedule) scrolling on
     the left, the context (hero, metrics) sticky on the right. Below that, one priority-ordered
     stack: hero → queue → schedule → metrics.
   - **(PAD-336, B-112) A schedule row's layout follows the width of the list, not the viewport.**
     The fixed columns (time, fill bar and count, badge, invite action) sit in one row only when
     the list itself is at least 760px wide. Below that, the title sits over the time and bar, the
     way it does on a phone, with the badge and invite action to its right. The class title gets
     the room that is left and ellipsizes only when it is longer than that room. The invite action
     shows whenever the list is at least 480px wide, so a phone keeps its layout. Web-only: iOS
     already stacks the title over the time (ticket PAD-336 measured it rendering in full at 375px).
     At a 1280px desktop the list is about 530px wide, and the one-row layout left the title 66px.
   - **(PAD-438, B-223) A tile keeps its layout when the page above it changes.** The student's
     "Your record" tiles share each row equally and a tile's card fills its cell, but the card
     never takes its height from a zero basis: on iOS, rows that appeared above the record after
     its first layout (a class the coach just added, a claim banner, a new ask) collapsed every card
     to an empty strip under the next heading. iOS only: web lays the grid out in the browser,
     where the same classes never collapsed.
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
   their own calendar, consistent with `calendar` rule 6 and `notifications.config` rule 6b.
   `LessonInstance.start_datetime` is stored on the club's wall clock (R-023, PAD-256). So the
   half-open `[start, end)` window is tomorrow 00:00 to the day after 00:00 in wall-clock terms, and
   it is compared with `start_datetime` directly, with no UTC conversion. PAD-144 converted the
   window to naive UTC on the assumption that class times were stored in UTC. In summer that made
   the window 23:00 to 23:00: a class at 23:30 today was counted as tomorrow's, and one at 23:30
   tomorrow was left out.
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
   **(PAD-583) The student home follows the same rule.** It loads its classes ONCE — one
   calendar-pipeline call over the hero's 90-day window — and the hero, the schedule and the
   "Upcoming lessons" tile cut their own windows from that set, with output identical to loading
   each window separately (the PAD-571 baseline measured 221 statements for three separate
   loads against 46 for the coach). The player instance loader eager-loads the instance, its
   lesson, the lesson's coaches, the instance's coaches and presences, so a window costs a fixed
   number of statements however many classes it holds; the queue's per-row lookups of the
   instance and the message are batched.
9. **(B-058)** A class is in a dashboard window when it overlaps it: its **end instant** is
   after the window start and its start instant is before the window end. The end instant is
   the class's END datetime, never the start date joined to the end time-of-day. `date`,
   `startTime` and `endTime` are UTC strings, so a class that crosses UTC midnight (23:15–00:15
   UTC; in Lisbon summer, any class ending after 01:00 local) ends on the NEXT date. Joining the
   start date to `endTime` put its end before its start, and every block built on the shared
   window silently dropped it: the coach hero, needs-you empty seats, next 7 days and week
   pulse, and the student hero and schedule.
10. **(PAD-283 / PAD-284 / PAD-285, B-078; extended by PAD-327) Where a needs-you item lands.**
   An item's `href` is the web path; iOS maps it through `features/dashboard/routes.ts`
   (`nativeRouteForWebPath`, pure — renamed from `dashboardRoute` when push tap-routing became
   its second caller, because a name that says "dashboard" while serving pushes is a small lie
   that costs later). **The mapper is now the app's single answer to "the server gave me a web
   path"**, shared by the dashboard's needs-you items and by `messaging.push-notifications`
   rule 7's `path` pushes, and it gained `/settings` (carrying its `section`) and `/dashboard`
   for the request alerts. It returns null for a path it does not know, and both callers treat
   null as "go nowhere".
   Per kind:
   - `validation` → `/presences?validate=1` (or `…&week=<offset>`): the Presences tab on that week
     **with the validate view already open** (`attendance.validation` rule 19), so the coach
     is one tap from validating, not two.
   - `reply` → `/messages/<conversationId>`: **that conversation**, on the thread (web route
     `/messages/:id`; iOS `/conversation/[id]`). Web still honours the pre-PAD-284
     `?conversationId=` shape by redirecting to the route.
   - `empty_seats` ("Convidar") → `class_href` **plus `&notify=1`**: the class detail with the
     Notificar picker already open (web `ClassDetailSheet` `openNotify`; iOS `/class/[id]`
     `notify` param), for a coach only. The hero and a schedule row keep the plain link.
     **(PAD-425)** The coach's schedule row also carries `inviteHref`, the same `&notify=1`
     link, and its **Convidar** button (rows with free seats) opens it; tapping the row itself
     still opens the plain class. The student's schedule carries no `inviteHref`. Web only by
     nature (R-024): the iOS schedule rows have no Convidar button (a row opens the class), so
     there is nothing to port; iOS's "Precisa de ti" card already uses the same link.
     **(PAD-426)** The class-detail button that opens this picker is labelled **Convidar**
     (en "Invite"), no longer "Notificar": it is how a coach invites players.
   - the student's asks and KPIs keep `dashboard.navigation` rules 6–8 / 11.

11. **(PAD-443) The validation card is tiered.** The coach's `validation` item renders with
    `attendance.validation` rule 23's tier (`validationTier(count)`: yellow for 1–5, red above 5)
    and reads "Tens N aulas por validar" (singular "Tens 1 aula por validar"), linking as rule 10.
    Its number is the one the Presences badge shows.

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

#### The validation card carries its tier (rule 11, PAD-443)
- **Given** a coach with 7 classes to validate this week
- **When** the dashboard renders
- **Then** the validation card reads "Tens 7 aulas por validar" in the red tier, and the Presences
  badge reads 7

#### Validation card counts classes for the tab's week (PAD-190 / PAD-201)
- **Given** a coach with two classes ended last week that still have an unvalidated presence,
  and nothing ended this week
- **When** they GET `/api/app/dashboard`
- **Then** the queue's `validation` item has `count: 2`, `weekOffset: -1` and
  `href: "/presences?week=-1"`, and `GET /api/app/class_instances/pending_validation/count`
  for last week's Monday–Sunday bounds answers `pendingCount: 2`

- **Given** a coach with one such class this week and two last week
- **When** they GET `/api/app/dashboard`
- **Then** the item has `count: 1`, `weekOffset: 0` and `href: "/presences?validate=1"` — the
  current week wins whenever it has work

- **Given** a coach whose only unvalidated class ended three weeks ago
- **When** they GET `/api/app/dashboard`
- **Then** there is no `validation` item

- **Given** the seeded `e2e-coach` on the dashboard
- **When** they press **Review** on the validation card
- **Then** they land on `/presences?validate=1…` (never the 404 page), the validate view is
  already open on that week, and the tab's trigger shows the same number of classes the card
  showed

#### A reply card opens the conversation (PAD-284, B-078)
- **Given** the seeded `e2e-coach` with an unread message from `e2e-student`
- **When** they press the reply card on the dashboard
- **Then** they are on `/messages/<that conversation>` with the thread visible — on iOS, on the
  conversation screen, not the Messages tab

#### "Convidar" opens the class on Notificar (PAD-285)
- **Given** the seeded `e2e-coach` with an under-capacity class in the next 7 days
- **When** they press **Convidar** on its card
- **Then** the calendar opens that class with the "Notificar alunos" picker already up; the
  same card's hero link and schedule row open the class without it

#### The schedule's "Convidar" opens the class on the invite picker (PAD-425)
- **Given** the seeded `e2e-coach` on a 1440px-wide dashboard with an under-capacity class in the next 7 days
- **When** they press **Convidar** on that class's "Próximos 7 dias" row
- **Then** the calendar opens it with `notify=1` and the "Notificar alunos" picker up, as the needs-you card does

#### "Mais tarde" never leaves its card (PAD-424)
- **Given** the seeded `e2e-coach` with an `empty_seats` card, the sidebar open
- **When** the dashboard is 1024, 1152, 1280, 1366 or 1440px wide
- **Then** the "Mais tarde" button lies inside the card's box at every width

#### Player dashboard
- **Given** an authenticated player enrolled in 2 classes this week
- **When** they GET `/api/app/dashboard`
- **Then** the response `id` is `player_default_v1` and its blocks are, in order,
  `messages_overview`, `next_class`, `needs_you`, `schedule_7d`, `kpi_grid` — no `class_list`,
  no `grid` — and `schedule_7d` lists both classes

#### The student home runs the pipeline once (rule 8, PAD-583)
- **Given** a student enrolled in 13 classes over the next 90 days, 3 of them in the next 30
- **When** the student dashboard is built with the calendar pipeline's `load_events` wrapped by a
  counter
- **Then** `load_events` was called exactly once, over the 90-day window, and the hero, schedule
  and KPI blocks equal, field for field, the blocks built from three separate loads

#### A student window costs a fixed number of statements (rule 8, PAD-583)
- **Given** one student with 3 scheduled classes in the next 30 days and another with 13
- **When** each student's dashboard is built with SQL statements recorded
- **Then** both builds issue the same number of statements (the absolute is reported by
  `backend/scripts/perf_baseline.py` before and after, not pinned here)

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

#### The student's record keeps its layout when rows appear above it (PAD-438, B-223)
- **Given** an iOS student whose dashboard is on screen, laid out with "Your record" below the fold
- **When** the coach adds a class with them and the student pulls to refresh, so new rows appear
  above the record (or a claim banner mounts above it after the first layout)
- **Then** all four tiles (Attended, Missed, Upcoming lessons, Invites) still show their label,
  number and context at full height, and "Evaluations" starts below them
  (`kpi-tiles.layout.test.tsx`, Maestro flow 116)

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

#### Before the first reminder the dashboard offers only "Avisar que não vou" (PAD-570)
- **Given** a student enrolled (`planned`) in a class whose first-reminder instant is still ahead
- **When** they GET `/api/app/dashboard`
- **Then** the row and the hero carry `pendingConfirmation: false`, `attendanceState: "planned"` and a `declineTarget`; `needs_you` has no `invite` for it; the Invites tile does not count it; both shells render one "Avisar que não vou" button and no Yes / No

#### After "Não vou" the dashboard row shows the hint, not buttons (PAD-570)
- **Given** a student whose `attendanceState` is `not_coming` on an upcoming class
- **When** they open `/`
- **Then** the row shows no Yes / No and no "Avisar que não vou", and shows the hint (the chat shortcut is on the class detail the row opens)

#### Student answers a reminder from the dashboard (PAD-202 correction)
- **Given** the seeded `e2e-student` with a reminder sent for a class in two days (`Presence`
  `planned`, the reminder instant passed — PAD-570) and an unread reminder message
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

#### A class crossing UTC midnight stays on both homes (B-058)
- **Given** a coach with a one-hour class at 23:15 UTC today that has empty seats, and a student signed up for it
- **When** the dashboards are built at 22:30 UTC
- **Then** the class is the coach's next-class hero, an empty-seats item on the needs-you queue and a row in the next 7 days
- **And** it is the student's next-class hero and a row on their schedule

#### A desktop schedule row shows the class title (PAD-336)
- **Given** a coach with seeded classes in the next 7 days, some under capacity
- **When** the dashboard renders at 1280×800
- **Then** every schedule row's title fits its element (`scrollWidth <= clientWidth`) and under-capacity rows still show their invite action
