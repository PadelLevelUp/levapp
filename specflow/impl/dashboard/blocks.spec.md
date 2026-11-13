---
id: dashboard.blocks
status: implementing
depends_on: [classes.instances, messaging.conversations, notifications.activity, players.list]
serves: [P-DASHBOARD-1]
governed_by: []
---

# dashboard.blocks


### Intent
Render a server-driven dynamic dashboard with configurable blocks for coaches and players.

### Rules for a session on the new engine (PAD-913)
Which engine runs a session is `notifications.config` rule 18. **For an old-engine session every rule
below holds as written.** For a session on the new engine (the swap, PAD-912; swap
plan §6.3 items 2, 7) the items in the table are replaced and the readings below
hold; the rest hold unchanged. Not marked inline: this section is the one place. When every coach is
drained, the old engine is deleted and the replaced items go with it.

| Item | For a new-engine session | Source |
|---|---|---|
| Rule 3, the `waiting_list_offer` ask | no such message: the waiting-list offer rides on the sorry, which the ask lists instead | `notifications.engine-answers` rules 4, 11 |
| Rule 3, a Yes answered `spot_filled` | sorry with the waiting-list offer, never "just filled" and never another offer (the owner, 2026-11-12) | `notifications.engine-answers` rules 3, 4 |
| Criterion 12 | replaced with rule 3 | — |
| Rule 3, the coach's item order (`empty_seats` → `reply` → `validation`) | `engine_alert` → `empty_seats` → `reply` → `validation`; "Mais tarde" snoozes an `engine_alert` as it snoozes `empty_seats` (B-030) | NA1 |

Readings:
- `vacancy_invite` is an open invitation of the student's (counting or not; it stays answerable, D4):
  one per class, carrying `invitationId` in place of `notificationEventId`, its id `invitation-<id>`, and
  answered on `POST /api/app/notify/respond` with that id (`notifications.invitations` NB5) (R, PAD-918).
  The home card (web `NeedsYouQueue`, iOS `blocks.tsx` `VacancyInviteCard`) answers a card carrying
  `invitationId` with `{invitationId, action: "yes"|"no"}` and reads the route's answer, one toast each,
  from one shared helper (proposed copy, for the owner): `confirmed` "Estás inscrito." / "You're in.";
  `declined` "Recusado." / "Declined."; `sorry` "A vaga já foi ocupada." / "The spot was already
  taken." (bad news); `closed_same_hour` "Já estás noutra aula a essa hora." / "You're already in
  another class at that time." (bad news); `class_started` "A aula já começou." / "The class has
  started." (bad news too: nothing was taken; Session5's reading). The helper is `@levelup/config`
  `engineAnswerToast`, keys `dashboard.needsYou.engineAnswer.*`. A card carrying `notificationEventId` is
  the old engine's and answers as today.
- Rules 6–7 (the coach's pending confirmations): the set counts the new-engine invitations still open
  for tomorrow's classes (counting or not), and the nudge re-pushes each one's own message, never a new
  invitation (R, PAD-918).
- `pendingConfirmation` comes from the engine's attendance requests instead of the reminders (`notifications.engine-timeline` rule 2).

The coach alert card (swap step 8, PAD-920). **Copy marked "proposed" awaits the owner's approval.**
- **NA1. A new `needs_you` item, `engine_alert`, first in the coach's order** (`engine_alert` →
  `empty_seats` → `reply` → `validation`): one per new-engine session and spot type holding a coach
  alert (`notifications.engine-planning` rule 11) in the current week's window (as `empty_seats`), soonest
  first. It carries `lessonInstanceId`, the class's title, ISO date and start time, `reason`
  (`no_candidate`, the engine's `ALERT_NO_CANDIDATE` in `notifications/constants.md`), `side` (`left`, `right` or null for either), `level` and `count`, and
  `href` to the class detail (`class_href(event)`, the `empty_seats` item's shape). It is listed while the store holds the alert, which it drops when a run
  finds the type covered, gone or with a candidate (`notifications.engine-planning` rule 11,
  `AlertCleared`). That class's `empty_seats` item is not shown too: the alert says more.
- **NA2. The card**, web `NeedsYouQueue` and iOS `blocks.tsx`, both from one shared copy helper:
  title "Ninguém para convidar" / "Nobody left to invite"; line "{count} vaga(s){side} · {class},
  {weekday} {time}" / "{count} open spot(s){side} · {class}, {weekday} {time}"; hint "Convida alguém à
  mão ou alarga os grupos de convite." / "Invite someone by hand or widen your invitation groups." (all
  proposed). Test id `needs-you-engine-alert-<lessonInstanceId>-<side or either>`; the card opens the
  class.
- **NA3. The alert also reaches the coach as a message.** The store's outbox posts the
  `coach_no_candidate` template (`notifications.message-templates` new-engine section) in the coach's
  Assistant conversation as `message_type` `engine_alert` with `msg_metadata` `{engine: "new",
  lessonInstanceId, reason, side, levelId, levelLabel, count, href, date}` (`notifications.invite-simulation`
  N2's spot-type shape; `href` the class's `class_href(event)`, `date` the class's club-local
  `YYYY-MM-DD`), and pushes it, once per alert (`notifications.engine-store` rule 2). Both shells show
  it as a text bubble with a link to the class, which reads "Abrir aula" / "Open class" (proposed; its
  own key `messages.engineAlert.openClass`, not a fallback title).
- **NA4. No rename.** The wire names `vacancy_invite` and `empty_seats` stay: renaming them breaks older
  builds for no reader's gain, and their copy already says "convite" and "vagas".
- **NA5. The open-spots card on a new-engine class (the owner, 2026-11-13, decisions 17 and 18).** Every
  `empty_seats` item carries `engineVersion` (`"old"` | `"new"`, the session's engine by
  `notifications.config` rule 18). A new-engine item also carries `pendingInvites`: the class's counting
  invitations (`notifications.engine-planning` rule 3), the same count as `calendar.event-detail` ND2's
  "N pending"; an old-engine item has no `pendingInvites` key. The card stays (decision 18). On a
  new-engine item both shells, web `NeedsYouQueue` and iOS `blocks.tsx`:
  - add "{pending} convite(s) pendente(s)" / "{pending} pending invitation(s)" (proposed; key
    `dashboard.needsYou.emptySeats.pending`, plural) to the detail line, when `pendingInvites` is 1 or
    more, under test id `needs-you-empty-seats-pending-<id>`;
  - drop the "Convidar N jogadores" button, test id `needs-you-empty-seats-invite-<id>` on both shells
    (today it has none) (decision 17's stopgap, until a manual invitation on a
    new-engine class is an engine invitation, `notifications.manual` new-engine section); "Mais tarde" stays.
  An item with no `engineVersion` (an older server) reads as `old`. An old-engine card is unchanged.
  Today: `_empty_seat_items` (`helpers/dashboard/coach_home.py`) builds the item from calendar events
  that already hold `engineVersion` (`serializers/calendar_event.py`, `class_engine_fields`) but copies
  neither it nor a count; the class's counting invitations are the `invitations` rows that
  `invitation_engine/timeline.py` `counting` holds true for.

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
     **(PAD-740, B-682) The coach's `empty_seats` cover the current week only:** the classes
     that overlap `[now, next Sunday 00:00)` on the club's clock (rule 9's overlap). The week runs
     Sunday to Saturday (`calendar.view` rule 5a), the same `week_start` the week pulse uses.
     On Thursday 22 Oct the queue offers the classes up to Saturday 24 Oct and none from
     Sunday 25 Oct. From Sunday 25 Oct it offers 25–31 Oct.
     A class that has already ended is never offered. Before PAD-740 the window was a rolling
     `[now, now + 7 days)`, so on every day but Sunday it reached into next week.
     Later weeks stay on the calendar. `schedule_7d` ("Próximos 7 dias") keeps its rolling
     7-day window, set in its own rule below.
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
     **(PAD-740, B-682) Every card keeps its own height.** On web desktop the queue is a
     two-column grid. Its cards align to the top of their row (`items-start`) instead of
     CSS grid's default stretch, so a `reply` card next to an `empty_seats` card stays as
     compact as its content and is not stretched to the class card's height.
     iOS and Android stack the queue in a single column (mobile `blocks.tsx` `NeedsYouQueue`),
     where no sibling sets a card's height, so the layout fix is web-only. The current-week
     window above applies to every shell, because the server computes it.
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
     - Code to follow: delete the unused `count_pending_confirmations` helper and its test; only
       `notify_pending_confirmations` stays.
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
     hero shows the same. A row whose state is `not_coming` on a class that has not started shows what its
     `comeBack` says (PAD-684, `attendance.confirm` rule 28): "Afinal vou", or "A tua vaga já foi
     ocupada" with "Juntar-me à lista de espera", or "Estás na lista de espera". (Before PAD-684
     it showed the one-line hint "Respondeste que não vais…", `calendar.detail.declinedFinalHint`,
     which App Store builds that do not read `comeBack` still show.) A class with reminders off is never in "Precisa de
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
   **The nudge re-pushes, it does not re-invite (PAD-620; PAD-612 R2).** Each pending student is sent
   again the push of the invitation they already hold — its own text, opening its conversation — and
   no new invitation or chat message, so the pending set and every bubble stay as they were. It used
   to send a full new invitation through the manual path on every press, stacking live invitations.

8. **(PAD-262, audit H9) One pipeline call per paint, scoped in SQL.** The coach home loads its
   classes ONCE — one calendar-pipeline call over the widest window any block needs (from a week
   before the current week to the hero's 90-day horizon) — and every block cuts its own window
   from that set; the blocks' output is identical to loading each window separately. **(PAD-754)**
   "Identical" is a claim about the preloaded set, which is the only production path: the coach
   and student assemblers (`helpers/dashboard/coach.py`, `player.py`) always pass it. A block
   called without one (`events=None`, reached only from tests) loads just its own window through
   the instance loader, which keeps classes that *start* inside the window. A class already
   running at that window's start (for the hero and the next 7 days, a class running across `now`)
   is therefore missing from a standalone call. The preloaded window opens a week before the current
   week, so the dashboard keeps it by rule 9's overlap test. The
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
   lesson and its presences (the student path reads no coach junction), so a window costs a
   fixed number of statements however many classes it holds; the confirmation state and the
   askable set are computed once over the union, and the queue's per-row lookups of the
   instance and the message are batched.
9. **(B-058)** A class is in a dashboard window when it overlaps it: its **end instant** is
   after the window start and its start instant is before the window end. The end instant is
   the class's END datetime, never the start date joined to the end time-of-day. `date`,
   `startTime` and `endTime` are the club's wall clock (R-023, PAD-256; B-058 was written when they
   were UTC), so a class that crosses midnight (23:15–00:15) ends on the NEXT date. Joining the
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
12. **(PAD-792, B-711) A class that has started is no longer something to fill.** Rule 9 keeps a
    running class in every coach window on purpose (PAD-754). Each block that offers to fill a class
    asks instead whether it has started: its start instant at or before `now`, both on the club's
    wall clock (`Europe/Lisbon`, R-023), so the cut is the class's start time in the coach's zone.
    a. **Needs-you:** an `empty_seats` item only for a class that has not started. At its start
       time the card goes, and with it its count in "X coisas precisam de ti".
    b. **The hero and the next 7 days:** a class that has started and not ended is `inProgress`.
       The hero reads "A DECORRER · 19:30–21:00" ("IN PROGRESS · …") instead of "A SEGUIR · 19:30",
       with no "starts in" chip. Once the class ends the hero is the next class that has not started,
       with "A SEGUIR". The running class stays the first row of the next 7 days (PAD-754), with no
       `inviteHref`; both shells drop its seats badge (Vazia, N vagas) and its Convidar.
    c. **(PAD-797) Two or more classes running at once** (two courts): the hero shows one
       "A DECORRER" card per running class, in start order, each with its own start–end and its
       own Abrir to the class, and no invite button. The block's own `data` is the first running
       class, so a build that predates PAD-797 still shows that one; `alsoRunning` lists the
       others (same fields, set only when there are others). One running class, or none, is
       unchanged from 12b.
    d. **The student home** loads its classes from `now` (the player instance loader keeps
       `start_datetime >= start`), so a running class never reaches it: at its start time the
       student's hero is already the next class, never `inProgress`. A student "A DECORRER" would
       need that loader window changed (rule 8's statement counts, PAD-583); not in PAD-792.
    e. **Not in this rule:** invites to a started class from other entry points (the calendar's
       Notificar, vacancy invites). The invite engine is unchanged; the owner decides.

### Acceptance Criteria

#### DASHBOARD-BLOCKS-1: Coach dashboard
- **Given** an authenticated coach
- **When** they GET `/api/app/dashboard`
- **Then** the response includes blocks, in order: `messages_overview`, `next_class`, `needs_you`,
  `incomplete_players`, `schedule_7d`, `week_pulse` (the order is stated in DASHBOARD-BLOCKS-36)

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

- **Given** the seeded `e2e-coach` on the dashboard with an under-capacity class this week (Sunday to Saturday)
- **When** they press **Later** on that card
- **Then** the card is gone after the dashboard refetches and the "needs you" count drops by one

#### DASHBOARD-BLOCKS-2: The validation card carries its tier (rule 11, PAD-443)
- **Given** a coach with 7 classes to validate this week
- **When** the dashboard renders
- **Then** the validation card reads "Tens 7 aulas por validar" in the red tier, and the Presences
  badge reads 7

#### DASHBOARD-BLOCKS-3: Validation card counts the whole backlog of classes (rule 3, PAD-190 / PAD-201 / PAD-539)
- **Given** a coach with one unvalidated class this week and two last week
- **When** they GET `/api/app/dashboard`
- **Then** the `validation` item has `count: 3`, `weekOffset: 0` and `href: "/presences?validate=1"`

- **Given** a coach whose only unvalidated classes ended three weeks ago
- **When** they GET `/api/app/dashboard`
- **Then** the item counts them, with `weekOffset: -3` and `href: "/presences?validate=1&week=-3"`

- **Given** two unvalidated presences on one class
- **When** they GET `/api/app/dashboard`
- **Then** the item counts it once

- **Given** nothing to validate
- **When** they GET `/api/app/dashboard`
- **Then** there is no `validation` item

- **Given** the seeded `e2e-coach` on the dashboard
- **When** they press **Review** on the validation card
- **Then** they land on `/presences?validate=1…` (never the 404 page), the validate view is
  already open on that week, and the tab's trigger shows the same number of classes the card
  showed
- Code to follow: tighten the "count is the endpoint's number for its week" test in
  `test_dashboard_coach_home.py` so it also covers a backlog spread over more than one week.

#### DASHBOARD-BLOCKS-4: A reply card opens the conversation (PAD-284, B-078)
- **Given** the seeded `e2e-coach` with an unread message from `e2e-student`
- **When** they press the reply card on the dashboard
- **Then** they are on `/messages/<that conversation>` with the thread visible — on iOS, on the
  conversation screen, not the Messages tab

#### DASHBOARD-BLOCKS-5: "Convidar" opens the class on Notificar (PAD-285)
- **Given** the seeded `e2e-coach` with an under-capacity class this week (Sunday to Saturday)
- **When** they press **Convidar** on its card
- **Then** the calendar opens that class with the "Notificar alunos" picker already up; the
  same card's hero link and schedule row open the class without it

#### DASHBOARD-BLOCKS-6: The schedule's "Convidar" opens the class on the invite picker (PAD-425)
- **Given** the seeded `e2e-coach` on a 1440px-wide dashboard with an under-capacity class in the next 7 days
- **When** they press **Convidar** on that class's "Próximos 7 dias" row
- **Then** the calendar opens it with `notify=1` and the "Notificar alunos" picker up, as the needs-you card does

#### DASHBOARD-BLOCKS-7: "Mais tarde" never leaves its card (PAD-424)
- **Given** the seeded `e2e-coach` with an `empty_seats` card, the sidebar open
- **When** the dashboard is 1024, 1152, 1280, 1366 or 1440px wide
- **Then** the "Mais tarde" button lies inside the card's box at every width

#### DASHBOARD-BLOCKS-8: Player dashboard
- **Given** an authenticated player enrolled in 2 classes this week
- **When** they GET `/api/app/dashboard`
- **Then** the response `id` is `player_default_v1` and its blocks are, in order,
  `messages_overview`, `profile_incomplete` (only while a level or a side is missing), `next_class`
  (only when a class is scheduled), `needs_you`, `schedule_7d`, `kpi_grid`, `evaluations` (only for
  a client that declares it, when a card is shared) — no `class_list`, no `grid` — and
  `schedule_7d` lists both classes

#### DASHBOARD-BLOCKS-9: The student home runs the pipeline once (rule 8, PAD-583)
- **Given** a student enrolled in 13 classes over the next 90 days, 3 of them in the next 30
- **When** the student dashboard is built with the calendar pipeline's `load_events` wrapped by a
  counter
- **Then** `load_events` was called exactly once, over the 90-day window, and the hero, schedule
  and KPI blocks equal, field for field, the blocks built from three separate loads

#### DASHBOARD-BLOCKS-10: A student window costs a fixed number of statements (rule 8, PAD-583)
- **Given** one student with 3 scheduled classes in the next 30 days and another with 13
- **When** each student's dashboard is built with SQL statements recorded
- **Then** both builds issue the same number of statements (the absolute is reported by
  `backend/scripts/perf_baseline.py` before and after, not pinned here)

#### DASHBOARD-BLOCKS-11: Student invite reaches the queue (PAD-202)
- **Given** an authenticated student with a `Presence` on tomorrow's 18:00 class where
  `invited = true` and `confirmed = false`, and a confirmed presence on a class the day after
- **When** they GET `/api/app/dashboard`
- **Then** `needs_you.count` is 1 and its single item has `kind: "invite"`, the class title,
  tomorrow's ISO date, `timeLabel: "18:00"` and a `/calendar?classId=…&date=…` href; the
  confirmed class is absent from the queue

#### DASHBOARD-BLOCKS-12: Vacancy invitations and waiting-list offers reach the queue (PAD-236)
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

#### DASHBOARD-BLOCKS-13: Student hero is the soonest class (PAD-202)
- **Given** an authenticated student whose next class starts in 45 minutes
- **When** they GET `/api/app/dashboard`
- **Then** `next_class.data.isToday` is `true`, `minutesUntil` is 45 and `players` lists the
  signed-up classmates (capped at 2)

#### DASHBOARD-BLOCKS-14: The student's record keeps its layout when rows appear above it (PAD-438, B-223)
- **Given** an iOS student whose dashboard is on screen, laid out with "Your record" below the fold
- **When** the coach adds a class with them and the student pulls to refresh, so new rows appear
  above the record (or a claim banner mounts above it after the first layout)
- **Then** all four tiles (Attended, Missed, Upcoming lessons, Invites) still show their label,
  number and context at full height, and "Evaluations" starts below them
  (`kpi-tiles.layout.test.tsx`, Maestro flow 116)

#### DASHBOARD-BLOCKS-15: Student with nothing scheduled has no hero (PAD-202)
- **Given** an authenticated student with no upcoming class in the next 90 days
- **When** they GET `/api/app/dashboard`
- **Then** no `next_class` block is present, `schedule_7d.totalCount` is 0 and `needs_you.count`
  is 0

#### DASHBOARD-BLOCKS-16: Student KPIs carry their denominator (PAD-202)
- **Given** an authenticated student with 12 attended and 3 missed presences
- **When** they GET `/api/app/dashboard`
- **Then** the `kpi_grid` Attended item is `{ value: 12, total: 15 }` and Missed is
  `{ value: 3, total: 15 }`, with the `href` values of `dashboard.navigation` rules 11 / 11a
  unchanged

#### DASHBOARD-BLOCKS-17: Upcoming lessons is the schedule's count (PAD-235)
- **Given** an authenticated student signed up to one class in 45 minutes, invited-but-unanswered
  on tomorrow's class, confirmed on the day after's, and confirmed on one in 12 days
- **When** they GET `/api/app/dashboard`
- **Then** the `kpi_grid` "Upcoming lessons" item has `value: 4` — equal to
  `schedule_7d.totalCount` — not the 2 confirmed ones

- **Given** the seeded `e2e-student` on the dashboard
- **When** the page renders
- **Then** the number on the "Upcoming lessons" tile equals the `totalCount` of the
  `schedule_7d` block in the same payload

#### DASHBOARD-BLOCKS-18: Before the first reminder the dashboard offers only "Avisar que não vou" (PAD-570)
- **Given** a student enrolled (`planned`) in a class whose first-reminder instant is still ahead
- **When** they GET `/api/app/dashboard`
- **Then** the row and the hero carry `pendingConfirmation: false`, `attendanceState: "planned"` and a `declineTarget`; `needs_you` has no `invite` for it; the Invites tile does not count it; both shells render one "Avisar que não vou" button and no Yes / No

#### DASHBOARD-BLOCKS-19: After "Não vou" the dashboard row shows no buttons, only what `comeBack` says (PAD-570, PAD-684)
- **Given** a student whose `attendanceState` is `not_coming` on an upcoming class
- **When** they open `/`
- **Then** the row shows no Yes / No and no "Avisar que não vou", and shows what `comeBack` says (DASHBOARD-BLOCKS-45)

#### DASHBOARD-BLOCKS-20: Student answers a reminder from the dashboard (PAD-202 correction)
- **Given** the seeded `e2e-student` with a reminder sent for a class in two days (`Presence`
  `planned`, the reminder instant passed — PAD-570) and an unread reminder message
- **When** they open `/` and press **Yes** on that class's row in the upcoming list
- **Then** their `Presence.confirmed` is `true`, the row shows no Yes/No, the queue count drops by
  one, and the dashboard's `messages_overview.unreadMessages` is lower than before

#### DASHBOARD-BLOCKS-21: Student sees classes beyond the coming week (PAD-202 correction)
- **Given** an authenticated student whose only class is in 12 days
- **When** they GET `/api/app/dashboard`
- **Then** `schedule_7d.totalCount` is 1 and the class is listed with `pendingConfirmation: false`

#### DASHBOARD-BLOCKS-22: Student dashboard renders the shared design language (PAD-202)
- **Given** the seeded `e2e-student` on a 1280px viewport
- **When** they open `/`
- **Then** the page shows a greeting heading (no "Dashboard"/"Painel" heading), the navy
  "next class" hero, the "NEEDS YOU" and "NEXT 7 DAYS" eyebrows and the KPI tiles with their
  denominators; and the same locators the coach home exposes (`dashboard-next-class`,
  `dashboard-needs-you`, `dashboard-schedule`) are present under `student-dashboard`

#### DASHBOARD-BLOCKS-23: A class crossing UTC midnight stays on both homes (B-058)
- **Given** a coach with a one-hour class at 23:15 UTC today that has empty seats, and a student signed up for it
- **When** the dashboards are built at 22:30 UTC
- **Then** the class is the coach's next-class hero, an empty-seats item on the needs-you queue and a row in the next 7 days
- **And** it is the student's next-class hero and a row on their schedule

#### DASHBOARD-BLOCKS-24: Needs-you offers only this week's classes (PAD-740, B-682)
- **Given** a coach with two classes with empty seats, on Saturday 24 Oct 2026 at 10:00 and Thursday 29 Oct 2026 at 08:00
- **When** the queue is built on Thursday 22 Oct 2026 at 10:00
- **Then** the Saturday 24 Oct class is an `empty_seats` item and the Thursday 29 Oct class is not
- **And** the Thursday 29 Oct class is still a row in "Próximos 7 dias"

#### DASHBOARD-BLOCKS-25: The week ends at Saturday midnight (PAD-740, B-682)
- **Given** a coach with classes with empty seats on Saturday 24 Oct 2026 at 23:45–23:59 and on Sunday 25 Oct 2026 at 00:30
- **When** the queue is built on Saturday 24 Oct 2026 at 23:30
- **Then** the Saturday class is an `empty_seats` item and the Sunday 00:30 class is not
- (PAD-792: this criterion used a Saturday class still running at 23:30; rule 12a takes a started
  class off the queue, so the edge is now a class that has not started.)

#### DASHBOARD-BLOCKS-26: On Sunday the queue moves to the new week (PAD-740, B-682)
- **Given** a coach with classes with empty seats on Saturday 31 Oct 2026 at 10:00 and Sunday 1 Nov 2026 at 10:00
- **When** the queue is built on Sunday 25 Oct 2026 at 00:00
- **Then** the Saturday 31 Oct class is an `empty_seats` item and the Sunday 1 Nov class is not

#### DASHBOARD-BLOCKS-27: A reply card stays compact beside a class card (PAD-740, B-682)
- **Given** the seeded `e2e-coach` on a 1440px-wide dashboard with an unread reply and an `empty_seats` card
- **When** the needs-you queue renders in two columns
- **Then** the reply card's height is its own content plus its padding, not its row's height

#### DASHBOARD-BLOCKS-28: A desktop schedule row shows the class title (PAD-336)
- **Given** a coach with seeded classes in the next 7 days, some under capacity
- **When** the dashboard renders at 1280×800
- **Then** every schedule row's title fits its element (`scrollWidth <= clientWidth`) and under-capacity rows still show their invite action

#### DASHBOARD-BLOCKS-29: A class running across now stays on the coach home (rules 8 and 9, PAD-754)
- **Given** a class from 10:45 to 11:45 and the club clock pinned at 11:15
- **When** the coach home loads its preloaded set and builds the hero and the next 7 days from it
- **Then** the hero is that class and it is the first row of the next 7 days

#### DASHBOARD-BLOCKS-30: A class that has started leaves needs-you at its start time (rule 12a, PAD-792)
- **Given** a class from 10:45 to 11:45 with 2 of 6 seats taken
- **When** the coach home is built at 10:44, and again at 10:45
- **Then** at 10:44 the class is an `empty_seats` item; at 10:45 it is not

#### DASHBOARD-BLOCKS-31: A running class is in progress on the coach's hero and schedule (rule 12b, PAD-792)
- **Given** a class from 10:45 to 11:45 with 2 of 6 seats taken, a full class tomorrow, and the club clock pinned at 11:15
- **When** the coach home is built
- **Then** the hero is the running class with `inProgress` true and `minutesUntil` null
- **And** it is the first row of the next 7 days with `inProgress` true and no `inviteHref`, and tomorrow's row has `inProgress` false and its `inviteHref`
- **And** at 11:45 the hero is tomorrow's class with `inProgress` false

#### DASHBOARD-BLOCKS-32: The shells read the in-progress state (rule 12b, PAD-792)
- **Given** a hero payload for "Treino A" 19:30–21:00 with `inProgress` true, and a schedule with that class (`inProgress` true) and another (`inProgress` false, 0 of 2)
- **When** web and iOS render them
- **Then** the hero's eyebrow is `dashboard.hero.inProgress` with 19:30 and 21:00, not `upNext`
- **And** the running row shows no "Vazia" badge and (web) no Convidar, while the other row keeps both

#### DASHBOARD-BLOCKS-33: Two running classes are two hero cards (rule 12c, PAD-797)
- **Given** classes 19:30–21:00 and 20:00–21:00, a class at 21:30, and the clock at 20:23
- **When** the hero is built
- **Then** its data is the 19:30 class, `inProgress` true, and `alsoRunning` holds only the 20:00 class, `inProgress` true, with its own 20:00–21:00 and link
- **And** with only the 19:30 class running, the block has no `alsoRunning`

#### DASHBOARD-BLOCKS-34: The shells show a card per running class (rule 12c, PAD-797)
- **Given** a hero payload for "Treino A" 19:30–21:00 with `alsoRunning` holding "Treino B" 20:00–21:00, both `inProgress`
- **When** web and iOS render it
- **Then** there are two cards, each reading `dashboard.hero.inProgress` with its own start and end, and Abrir on "Treino B" opens "Treino B"
- **And** neither card has an invite button; without `alsoRunning` there is one card, as in PAD-792

#### DASHBOARD-BLOCKS-35: A student's hero moves on at the class's start time (rule 12d, PAD-792)
- **Given** a student signed up for a class from 10:45 to 11:45 and a class tomorrow, and the club clock at 11:15
- **When** the student home is built
- **Then** the hero is tomorrow's class with `inProgress` false, and the running class is not on the student's schedule

#### DASHBOARD-BLOCKS-36: The coach home is built from one load whose cost does not grow with the classes (rule 8)
- **Given** a coach with three classes in the window, then with thirteen, and a second coach with classes of their own
- **When** the coach's dashboard is built
- **Then** the classes are loaded once, and that load costs the same number of queries for three classes and for thirteen
- **And** only that coach's classes are loaded, whether the coach is set on the class or on its series
- **And** the blocks come in the order `next_class`, `needs_you`, `incomplete_players`, `schedule_7d`, `week_pulse`, and each of the four other than `incomplete_players` equals the block built on its own
test: `backend/padel_app/tests/test_pad262_dashboard_pipeline.py` › `test_a_window_costs_a_fixed_number_of_statements` (+2 more)

#### DASHBOARD-BLOCKS-37: The coach's hero is the soonest class, counted on the club's clock (rule 3)
- **Given** a coach whose next class, B1, starts in 45 minutes with 2 of its 6 seats taken
- **When** the `next_class` block is built
- **Then** it carries the class's title, `filled: 2`, `capacity: 6`, `minutesUntil: 45`, `isToday: true` and the roster's initials
- **And** the 45 minutes hold in summer and in winter, on the coach's home and on the student's
- **And** `minutesUntil` is null when the class is more than two hours away
- **And** a coach with nothing scheduled gets no `next_class` block
test: `backend/padel_app/tests/test_dashboard_coach_home.py` › `test_hero_is_omitted_entirely_when_nothing_is_scheduled` (+4 more)

#### DASHBOARD-BLOCKS-38: The coach's queue lists free seats, replies and the validation card, each with its link (rules 3, 10)
- **Given** a coach with a class today that has free seats, students who wrote and were not answered, and a class last week still to validate
- **When** the `needs_you` block is built
- **Then** the free-seats item comes before the validation card, and `count` is the number of items
- **And** the free-seats item links to `/calendar?classId=<id>&date=<day>&notify=1`, a reply links to `/messages/<conversation id>`, and the validation card links to `/presences?validate=1`, with `&week=<offset>` for an earlier week
- **And** with six conversations waiting, three replies are listed, one per conversation, newest first, each previewing its newest message, read in one query
- **And** a class that already ended this week is not offered
- **And** a coach with nothing outstanding gets the block with `count: 0` and no items
test: `backend/padel_app/tests/test_pad740_needs_you_current_week.py` › `test_a_class_that_already_ended_this_week_is_not_offered` (+6 more)
- Code to follow: make the queue-order test seed a reply, so the order of free seats, replies and validation
  is proved with all three present.

#### DASHBOARD-BLOCKS-39: Snoozing a card again restarts its day (rule 3)
- **Given** a free-seats card snoozed at 10:00
- **When** the coach snoozes it again at 11:00
- **Then** it returns 24 hours after the second snooze, not 48 hours after the first, and one snooze is stored
test: `backend/padel_app/tests/test_dashboard_needs_you_snooze.py` › `test_snoozing_again_restarts_the_clock_instead_of_stacking`

#### DASHBOARD-BLOCKS-40: The schedule carries its total, and only the coach's rows carry an invite link (rules 3, 10)
- **Given** a coach with a class today, a full class tomorrow and a class three days ago
- **When** the `schedule_7d` block is built for the coach, and for a student
- **Then** the coach's block has `totalCount: 2` and the two coming classes in order, each with its day and its fill
- **And** each coach row's `inviteHref` is its `href` plus `&notify=1`, the same link the queue's free-seats card for that class carries
- **And** a student's rows carry no `inviteHref`
test: `backend/padel_app/tests/test_pad425_schedule_invite_href.py` › `test_every_coach_schedule_row_links_to_the_invite_flow` (+3 more)
- Code to follow: make the `totalCount` test seed more classes than the rows it lists, so the total is shown
  to exceed the rows.

#### DASHBOARD-BLOCKS-41: The week pulse carries its denominators, and a delta only when there is a week to compare (rule 3)
- **Given** a coach with four players signed up to tomorrow's full class, and a coach with no classes
- **When** the `week_pulse` block is built
- **Then** the first has `players: {active: 4, total: 4, idle: 0}`, a seats percentage equal to filled over total, and a seven-day trend
- **And** it reports a delta when the week before had a class
- **And** the coach with no classes reads 0 %, 0 of 0, and a null delta
test: `backend/padel_app/tests/test_dashboard_coach_home.py` › `test_week_pulse_carries_denominators_and_counts_active_players` (+2 more)

#### DASHBOARD-BLOCKS-42: The nudge re-pushes tomorrow's unanswered invitations and creates nothing (rules 6, 7)
- **Given** a class tomorrow on the club's clock with two students whose invitation is unanswered, one who confirmed and one whose invitation expired, and a class today with an unanswered invitation
- **When** the coach sends the nudge
- **Then** two pushes go out, each with that student's own invitation text and a link to it, and no message or invitation is created
- **And** nudging twice leaves the student holding one live invitation
- **And** a student who blocks notifications, or whose invitation message was deleted, gets no push
- **And** "tomorrow" is the next calendar day on the club's clock: at 23:30 UTC on 14 August it is already the 15th in Lisbon, so tomorrow is the 16th
test: `backend/padel_app/tests/test_dashboard_pending_confirmations.py` › `test_pending_targets_grouped_by_instance` (+8 more)

#### DASHBOARD-BLOCKS-43: A student's row offers what the server's flag and the attendance state say (rule 3a)
- **Given** a student's dashboard row or hero
- **When** the shell decides which action to show
- **Then** a row the server marks pending offers Yes and No
- **And** a row that is not pending and is planned or coming offers the single "Avisar que não vou"
- **And** a row that is `not_coming` offers neither Yes and No nor the single decline button, and what it offers instead is DASHBOARD-BLOCKS-45
- **And** a row that is attended or missed offers nothing
- **And** the settled state wins over a stale pending flag
test: `frontend/packages/config/src/reminder-answer.test.ts` › `only 'Avisar que não vou' before the ask, and after a yes` (+4 more)
- Code to follow: in `reminder-answer.test.ts`, make "nothing once the coach's record stands or the row is
  unknown" expect no decline button for the unknown row.

#### DASHBOARD-BLOCKS-44: Student rows and the hero carry the flag and the id an answer needs (rules 3, 3a, 8)
- **Given** a student with a class they signed up for and were never asked about, a class they were asked about and have not answered, and a class they answered
- **When** their hero and schedule are built
- **Then** only the unanswered class has `pendingConfirmation: true`, and every row and the hero carry `lessonInstanceId`
- **And** the flag worked out for the whole home at once equals the one worked out class by class
- **And** a class that has started on the club's clock no longer counts in the Invites tile
test: `backend/padel_app/tests/test_pad256_dashboard_clock.py` › `test_kpi_to_confirm_uses_the_club_clock` (+2 more)

#### DASHBOARD-BLOCKS-45: A declined class shows what the server's `comeBack` says (rule 3a)
- **Given** a student's `not_coming` row on web carrying a `comeBack` value
- **When** the row renders and the student presses its button
- **Then** `rejoin` shows a button that answers yes and reloads; when that answer comes back `spot_filled` the row shows the spot-taken line and the waiting-list offer
- **And** `waiting_list` shows the spot-taken line and a button that joins the waiting list for that occurrence
- **And** `on_waiting_list` shows the state line and no button
- **And** a server that sends no `comeBack` gets the hint, and a `comeBack` of null shows nothing
test: `frontend/apps/web/src/components/dashboard/coach/ComeBackSlot.test.tsx` › `rejoin: the button answers yes for the item's instance, then the dashboard refetches` (+5 more)

#### DASHBOARD-BLOCKS-46: The greeting and the dates follow the viewer's own day and language (rule 3a)
- **Given** a viewer in English or Portuguese
- **When** the dashboard renders its greeting and its dates
- **Then** the greeting is the morning one until 11:59, the afternoon one until 18:59 and the evening one from 19:00, a full salutation with the name ("Good morning, {{name}}", "Bom dia, {{name}}")
- **And** a date is read and written as the viewer's local calendar day: 00:30 local on 9 August is `2026-08-09`
- **And** dates render in the active language (agosto, August), and the Portuguese column weekday is upper case with no full stop
test: `frontend/packages/config/src/dashboard-format.test.ts` › `uses the LOCAL date, not the UTC one` (+9 more)
- Code to follow: make the "always exactly one calendar day" test check that the end is exactly one calendar
  day after the start, not only after it.

#### DASHBOARD-BLOCKS-47: The iOS app sends a card's link to its native screen, and nowhere for a path it does not know (rule 10)
- **Given** the web paths the server puts on dashboard cards
- **When** the iOS app maps one to a screen
- **Then** `/settings?section=club` opens Settings on that section, `/dashboard` the dashboard tab and `/players` the Players tab
- **And** `/calendar` with a class id that is not a dashboard id opens the calendar tab
- **And** an unknown path maps to nothing, and the card goes nowhere
test: `frontend/apps/mobile/src/features/dashboard/routes.test.ts` › `falls back to the calendar tab when the class id is not a dashboard id` (+4 more)

#### DASHBOARD-BLOCKS-48: A coach alert is the first needs-you item and hides that class's empty-seats item (new-engine section NA1)
- **Given** a coach on `new` with an alert for a right spot of Thursday's class (1 uncovered) and an `empty_seats` class on Friday
- **When** the coach's home is read on Tuesday
- **Then** `needs_you` starts with one `engine_alert` (that class, `no_candidate`, side `right`, `count` 1, its href), then Friday's `empty_seats`, and Thursday's class has no `empty_seats` item; after the spot is covered, the next read has no `engine_alert`
test: `backend/padel_app/tests/test_pad920_dashboard_engine_alert.py` › `test_a_coach_alert_leads_the_queue_and_hides_its_empty_seats`

#### DASHBOARD-BLOCKS-49: The alert card shows on web and iOS from one copy helper (new-engine section NA2)
- **Given** an `engine_alert` item on web
- **Then** web shows the card with the shared title, line and hint under `needs-you-engine-alert-<id>-right`, and pressing it opens the class
test: `frontend/apps/web/src/components/dashboard/coach/NeedsYouQueue.engineAlert.test.tsx` › `shows the coach alert card and opens the class`

#### DASHBOARD-BLOCKS-50: The iOS alert card matches the web one (new-engine section NA2)
- **Given** the same item on iOS
- **Then** the same copy and test id show, and the card opens the native class screen
test: `frontend/apps/mobile/src/features/dashboard/blocks-engine-alert.test.tsx` › `shows the coach alert card and opens the class`

#### DASHBOARD-BLOCKS-51: The alert reaches the coach once as a message (new-engine section NA3)
- **Given** a `CoachAlert` in the outbox
- **When** the outbox sends it twice
- **Then** the coach's Assistant conversation has one `coach_no_candidate` message, its metadata carrying the class's `href` and club-local `date`, and the coach one push
test: `backend/padel_app/tests/test_pad920_dashboard_engine_alert.py` › `test_the_alert_reaches_the_coach_once_as_a_message`

#### DASHBOARD-BLOCKS-52: The alert message links to its class on web (new-engine section NA3)
- **Given** an `engine_alert` message in the coach's Assistant conversation on web, with `href`, and an older one with only `lessonInstanceId`
- **Then** both show a link reading `messages.engineAlert.openClass` ("Abrir aula") that opens the class, from `href` or else from `lessonInstanceId`
test: `frontend/apps/web/src/components/messages/MessageBubble.engineAlert.test.tsx` › `links the alert message to its class`

#### DASHBOARD-BLOCKS-53: The alert message links to its class on iOS (new-engine section NA3)
- **Given** the same messages on iOS
- **Then** both link to the native class screen the same way, with the `messages.engineAlert.openClass` text and accessibility label
test: `frontend/apps/mobile/src/features/messages/engine-alert-message.test.tsx` › `links the alert message to its class`

#### DASHBOARD-BLOCKS-54: A student's open new-engine invitation is their vacancy_invite (new-engine readings)
- **Given** a student with an open new-engine invitation to tomorrow's class (one that still counts and one that stopped counting, to two classes)
- **When** the student's home is read
- **Then** each class has one `vacancy_invite`, its id `invitation-<invitationId>`, carrying `invitationId` and no `notificationEventId`, and its Yes goes to `/notify/respond` with that id
test: `backend/padel_app/tests/test_pad918_player_home.py` › `test_an_open_engine_invitation_is_the_students_vacancy_invite`

#### DASHBOARD-BLOCKS-55: The coach's pending confirmations count and nudge open new-engine invitations (rules 6, 7; new-engine readings)
- **Given** a coach whose tomorrow's new-engine class has two open invitations (one no longer counting) and one answered
- **When** the coach's home is read and the coach presses the nudge
- **Then** the pending count is 2, and each of the two students gets their invitation's push again, with no new invitation or message
test: `backend/padel_app/tests/test_pad918_dashboard_pending.py` › `test_pending_confirmations_count_and_nudge_open_engine_invitations`

#### DASHBOARD-BLOCKS-56: The web home card answers a new-engine invitation by its id and reads the answer (new-engine readings)
- **Given** a student's web home with a `vacancy_invite` carrying `invitationId`, and one carrying `notificationEventId`
- **When** they press Yes on the first and the route answers `sorry`, and Yes on the second
- **Then** the first posts `{invitationId, action: "yes"}` to `/notify/respond` and shows the sorry toast as bad news, and the second answers by `notificationEventId` as today; each of the five actions maps to its toast in the shared helper
test: `frontend/apps/web/src/components/dashboard/coach/NeedsYouQueue.engineInvite.test.tsx` › `answers a new-engine invitation by its id and shows the answer`

#### DASHBOARD-BLOCKS-57: The iOS home card answers a new-engine invitation by its id and reads the answer (new-engine readings)
- **Given** the same cards on iOS
- **Then** the same requests are sent and the same toasts show
test: `frontend/apps/mobile/src/features/dashboard/blocks-engine-invite.test.tsx` › `answers a new-engine invitation by its id and shows the answer`

#### DASHBOARD-BLOCKS-58: An open-spots item says its class's engine and, on the new engine, how many invitations still count (new-engine section NA5)
- **Given** a coach on `new` whose class A has 3 open spots, 5 counting invitations and 2 open ones that no longer count, and a coach on `old` whose class B has 2 open spots and 3 live invitations
- **When** each coach's home is read
- **Then** A's `empty_seats` item carries `engineVersion` `new` and `pendingInvites` 5, and B's carries `engineVersion` `old` and no `pendingInvites` key
test: `backend/padel_app/tests/test_pad920_dashboard_empty_seats_engine.py` › `test_an_empty_seats_item_carries_its_engine_and_counting_invitations`

#### DASHBOARD-BLOCKS-59: The web open-spots card shows the pending count and no invite on a new-engine class (new-engine section NA5)
- **Given** the web home with a new-engine `empty_seats` item with `pendingInvites` 5, another with `pendingInvites` 0, and an old-engine item
- **Then** the first card's detail line shows "5 convites pendentes" under `needs-you-empty-seats-pending-<id>`, the second shows no pending text, neither has `needs-you-empty-seats-invite-<id>` and both keep "Mais tarde"; the old-engine card shows `needs-you-empty-seats-invite-<id>` and no pending text, as today; an item without `engineVersion` renders as the old-engine one
test: `frontend/apps/web/src/components/dashboard/coach/NeedsYouQueue.engineEmptySeats.test.tsx` › `shows the pending count and no invite button on a new-engine class`

#### DASHBOARD-BLOCKS-60: The iOS open-spots card does the same (new-engine section NA5)
- **Given** the same three items on iOS
- **Then** the same text, test ids and buttons show as on web
test: `frontend/apps/mobile/src/features/dashboard/blocks-engine-empty-seats.test.tsx` › `shows the pending count and no invite button on a new-engine class`

### Open questions
- The coach alert's channel and the card rename (swap plan §6.3 items 2, 7) — decision (S, owner away,
  PAD-913, 2026-11-12; the owner can reverse it): both a dashboard card (NA1, NA2) and one message with a
  push (NA3), because the card shows only on the home and the class may be days away; no rename (NA4).
  The card's copy is proposed, **for the owner's approval**.
- The open-spots card on a new-engine class (S, PAD-913, 2026-11-13, from the owner's decisions 17 and 18):
  the pending count counts counting invitations only, as the class detail's "N pending" (ND2), so the two
  never disagree; an older server's item without `engineVersion` reads as old, so the button stays where
  nobody knows the engine. The pending copy is proposed, **for the owner's approval**.
