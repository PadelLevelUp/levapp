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

> The open-spot clauses of rules 4 and 6 were specced ahead of PAD-130 and are **built** since
> it (phone treatment: `calendar.mobile-views` rule 5, `eligibility.open-spot-visibility`
> rule 11; B-541 fixed the phone shells).

### Rules
1. `GET /api/app/calendar?from=ISO&to=ISO` returns events in date range
2. Events include both lesson instances (materialized + virtual from recurrence) and calendar blocks
3. For coaches: shows all classes they teach + personal blocks
4. For players: shows classes they're enrolled in. **(PAD-130)** plus future classes with an
   empty spot that the player is eligible for and whose coach has made open spots visible — see
   `eligibility.open-spot-visibility` for the full conditions. With the visibility toggle off, or
   with no such class, this is exactly rule 4 as it has always been: enrolled classes only
5. Frontend renders week view (7-day grid) with `useCalendar` hook
5a. **Weeks start on Sunday (PAD-682; coordinator for the owner, 2026-10-21; numbering
   unconfirmed).** One constant, `WEEK_STARTS_ON = 0` in `@levelup/config`, is the first day of
   every week a coach or student sees: the week grid and its headers, the phone week strip, the
   month grid's columns (`calendar.mobile-views` rule 16), the add-class weekday chips, the
   add-to-classes pickers, and the "esta semana" ranges of the presences and attendance views.
   It is global (no per-coach setting). The backend's own weeks — the coach dashboard's "this
   week" and the validation badge's `weekOffset` (`attendance.validation`) — start on the same
   Sunday, so a count never disagrees with the grid beside it; a backend test reads the constant
   from the config package to keep the two in step. Not covered: the `{day}` placeholder's
   "esta / na próxima" wording sent to students (`notifications.message-templates` rule 18 keeps
   Monday-to-Sunday weeks) and recurrence weekday numbering (`daysOfWeek`, `weekdays`), which are
   conventions, not a week's first day. App Store builds 32/33 compute their grid on the device
   and keep Monday until they update.
6. Events are color-coded: academy classes, private classes, calendar block types. **(PAD-130)**
   an **open-spot class a player is not enrolled in uses a distinct colour** from that
   player's own classes — the two must never be mistaken for each other, since one is a commitment
   and the other is an offer. **(PAD-578)** Not by colour alone: for a **student** viewer every
   class they are enrolled in carries a ✓ mark (`calendar-enrolled-mark`, accessible label
   `calendar.eventCard.enrolled`) on its card and on its grid block; an open spot carries the
   "Open spot" chip instead; a canceled class carries no mark (red already says what matters);
   a coach's calendar carries no mark at all. The viewer's role reaches the cards through the
   calendar page, never through a card reading the session itself
7. Mobile-responsive: below 768px on web, and always on iOS, the calendar is the three-mode
   phone screen specified by `calendar.mobile-views` (Dia / Semana / Mês). Rules 5–6 and
   13–14 below describe what that leaf inherits or supersedes; desktop web is unchanged by it
8. Class events expose `participantCount` / `maxPlayers`, rendered on the event card as `X/Y`. `participantCount` is the **effective filled spots** for the instance, NOT the raw enrolment count: enrolled players (the instance's `presences`, PAD-259) minus those whose presence status is `absent` (declined the invite or cancelled), floored at 0. Players who have not yet responded still count toward `X`
9. Effective filled spots is computed in exactly one place — `LessonInstance.effective_filled_spots` on the backend model — and is the single source of truth shared by the calendar event card, the class-detail "capacity" field (calendar.event-detail), and the invitation engine's capacity checks (notifications.invitation-engine). No surface recomputes it independently
10. Lesson templates (non-materialized recurrence occurrences with no instance row) have no presences, so their `participantCount` is the series roster count (`player_in_lesson`)
11. Each event exposes a `status` of `completed` or `scheduled`. An event is `completed` once its **end datetime has passed** (compared against the current time on the club's clock: the stored end is Lisbon wall-clock, R-023, PAD-256), otherwise `scheduled`. The comparison uses the real end datetime — the event's date combined with its end time-of-day — NOT just the date. So a class that ended earlier **today** reads as `completed`, exactly like classes on previous days. For recurrence occurrences the end datetime is the occurrence date combined with the template's end time-of-day. "Now" uses the same naive-UTC clock (`utcnow_naive`) the scheduler uses to compare class datetimes
12. The week-range label (`useCalendar`'s `weekLabel`) is rendered in the **active UI language**, not a hardcoded English locale: month abbreviations follow the coach's `users.language` preference on web and on iOS alike (`pt` → "31 ago–6 set", `en` → "31 Aug–6 Sep"). `useCalendar` lives in `@levelup/hooks`, which must stay platform-neutral (no React DOM, no React Native, no Expo import), so the shell passes its active language in (`options.language`) and the hook derives the label from it. The language→`date-fns` `Locale` mapping lives in exactly one place, `resolveDateLocale` in `@levelup/config`, shared by both shells and by the hook; the fallback stays `pt` per settings.language rule 4. The label is *derived* from the stored language on every render, never frozen into state, so switching language in Settings re-renders it without a reload
13. **(PAD-170 C4, decided 2026-09-04)** iOS carries the same colour-coding legend web has
    (`calendar.legend.done / event / fill / full / next`), explaining rule 6's colour coding. The
    decision was to port it rather than decline it as an iOS-unneeded surface. It renders as a
    fixed-height legend row between the week nav and the day grid, so rule 14's `flex-1` / `flex-1`
    pair still splits whatever is left below those two fixed rows — the strip and the day list keep
    equal shares. The swatches show the TREATMENT, not a palette: the class colour is the coach's,
    so each sample uses a neutral stand-in and what it carries is the border, the fade and the
    dashed edge. The whole row is ONE accessibility element reading the five labels, because a
    legend is reference material and five VoiceOver stops between the nav and the grid would be
    five stops in the way. **(PAD-578)** For a **student** viewer the desktop legend adds
    `calendar.legend.enrolled` (a solid swatch with the ✓) and `calendar.legend.openSpots` (the
    dashed outline) ahead of the shared items, so the two treatments rule 6 distinguishes are
    explained where the legend exists; the coach's legend is unchanged. **(Superseded on phones by `calendar.mobile-views` rule 9 when that
    leaf ships: the iOS legend is removed and web hides it below 768px; desktop web keeps it.)**

14. **(PAD-172)** On iOS the week strip and the day-detail list are a `flex-1` / `flex-1` pair
    filling the space below the week-nav row, mirroring web's `MobileCalendarView` split. The
    strip's share of the screen is therefore **constant regardless of class density** — it neither
    collapses on a quiet week nor grows with the busiest day. Each day column scrolls **internally**
    when its classes exceed the column height, so overflow is absorbed by scrolling rather than by
    shrinking the strip or by truncating the list. Consequently iOS renders **every** class in a day
    column and never shows a `+N` more indicator; web still caps its column at 4 chips plus `+N`,
    which is a remaining web-side gap, not an iOS deviation. **(Superseded by
    `calendar.mobile-views` rule 10 when that leaf ships: the strip becomes date circles with a
    dot row on both shells — no chips, no `+N`, no internal column scrolling.)**

15. **(PAD-148)** The class/event card in the week grid (`CalendarEventCard`) is a real
    interactive control: focusable in DOM order, named for screen readers by its title **and**
    its time range, activatable with **Enter and Space** as well as a pointer click, with a
    visible focus ring. It stays a `div` carrying `role="button"` rather than becoming a
    native `<button>` because the same element is the HTML5 drag source for `calendar.drag-drop`
    and because its subtree contains `div`s and a `role="progressbar"` fill bar, which a
    `<button>` may not legally contain. Generalised by compass rule **R-026**; iOS already
    satisfies it (`EventCard`'s `Pressable` has `role="button"` + `accessibilityLabel`).

16. **(PAD-295; rule number unconfirmed)** On both clients, every comparison of a class, block,
    deadline or window time with "now" uses the **club's clock**, never the device's: `past` versus
    upcoming (`resolveEventState`), the next-class highlight and its "visible range contains
    today" gate (`findNextEventId`), the today ring in the strip, week header and month grid, and
    the `Hoje` / initial-day selection in `useCalendar`. The clock is `lisbonNow()` in
    `@levelup/config` — a `Date` whose local fields carry the `Europe/Lisbon` wall clock, with the
    same UTC fallback as `clubTodayISO` — and `isClubToday()` for day matching. Stored times are
    Lisbon wall-clock digits (R-023), so this is the client half of rule 11's server comparison.
17. **(PAD-348; rule number unconfirmed)** The shared `useCalendarEvents` hook (`@levelup/hooks`)
    never requests an empty range. While `from` or `to` is empty, for example on the iOS class
    screen before the instance has loaded its date, the query is disabled and makes no request. It
    runs once both ends are known. A caller's own `enabled: false` still wins. Rule 1's endpoint
    answers an empty range with 400; the client must not ask it one.

18. **(PAD-526, B-344; rule number unconfirmed) A class write re-reads the calendar.** After the
    coach creates, edits or deletes a class, the calendar shows the server's answer for the range
    on screen, without a reload. The write can reach occurrences other than the card that was
    clicked — a recurring class creates several in one week, and a "this and future" edit or
    delete changes every later one — and only the server knows them. The web page patches the
    clicked card at once (so nothing flickers) and then re-reads the range it shows, the same
    `readRange` a calendar-block save, a drag reschedule and PAD-488's request events already
    use; the newest read wins (rule 17's ordering). iOS already did this: its class mutations
    invalidate `["calendar-events"]`, `["class-instance"]` and `["dashboard"]` on success. So the
    fix is web-only, and the reason is that the iOS behaviour was already right.

19. **(PAD-591) The calendar reads only the lessons its range can show, and counts rosters in the
    same pass.** The coach and student lesson loaders bound one-off lessons from below as well as
    above (`start_datetime >= range_start - 1 day`; recurring series keep their own bounds), so a
    coach's history is not read and discarded on every request. The roster size each event carries
    (`participantCount`) comes from an eager load of the lesson's player junctions, never a lazy
    collection per lesson. The response is unchanged.
20. **(B-543, PAD-625; rule number unconfirmed) The coach can read every class on a dense day.**
    The desktop week grid lays a day out with the same shared `layoutDayColumn` as the phones
    (`calendar.mobile-views` rule 13): overlapping classes are packed into lanes, so a day gets as
    many columns as classes run at once. When a cluster needs more than **three** lanes, the first
    two render and the third holds one "+N" marker (`calendar-overflow`) spanning the hidden
    classes' time; activating it opens a list of those classes (title, time, fill), each opening
    the class exactly as its card does. Nothing is ever narrower than a third of the day column.
21. **(B-544, PAD-626; rule number unconfirmed) The desktop week never cuts a class.** It shows
    07:00–22:00 by default and widens to the whole hours of any class outside that window
    (`desktopHourRange`, `@levelup/config`); a class ending at midnight ends at 24:00 (PAD-553) and
    its card is its full height, with its time.
22. **(PAD-611; rule number unconfirmed; default accepted by the orchestrator 2026-10-11, owner veto
    open) A student's calendar says what each class is to them.** Every event on a student's
    calendar carries `studentRelation`, computed by the server per occurrence, one of:
    `enrolled` (their attendance state is `planned` or `coming`), `not_coming` (they said "Não vou",
    `attendance.confirm` rule 28), `attended` / `missed` (the coach's record, past), `invited` (a live
    — `sent` or `queued` — invitation to an occurrence they are not in), `waiting` (an active
    waiting-list entry for an occurrence they are not in) and `open_spot` (rule 4's offer). An
    occurrence appears once, by that precedence: enrolled › not_coming › attended/missed › invited ›
    waiting › open_spot. `invited` and `waiting` show whatever the coach's open-spot toggle says —
    they are the student's own business; an expired, answered or withdrawn invitation and an
    inactive waiting-list entry show nothing; a started or canceled occurrence is never invited or
    waiting. **Old clients:** `invited` and `waiting` events are sent only to a client that declares
    the `student-relations` capability (`X-LevApp-Capabilities`, PAD-352's pattern) — an App Store
    build that predates them would draw them as bookings; an undeclared client gets exactly the
    calendar it got before (the field on its own events is harmless and ignored). The treatment is
    `calendar.mobile-views` rule 5; desktop cards follow it, and the student's desktop legend adds
    `calendar.legend.invited`, `calendar.legend.waiting` and `calendar.legend.notComing`.
23. **(PAD-664; rule number unconfirmed; orchestrator for the owner, 2026-10-14) A student's
    calendar is coloured by what each class is to them, shows the full classes they could wait
    for, and can be narrowed to their own.** For a **student** viewer only — the coach's calendar
    keeps rules 6 and 13 and `calendar.mobile-views` rules 5, 7, 9 and 19 unchanged:
    - **Full classes.** A client that declares the `full-classes` capability also receives the
      eligible classes that are **full** (`eligibility.open-spot-visibility` rule 1a), each with
      `studentRelation` `full`, `openSpot: true`, `state` `"full"` and `spotsLeft` 0; the open ones
      then carry `state` `"open"` and `spotsLeft`. Rule 22's precedence extends to
      … › waiting › open_spot / full: a full class the student already waits for is `waiting`, once.
    - **Three colour families, shared resolver.** The colour says the relation, never the coach:
      **blue** (`primary`) for the student's own — `enrolled` solid with ✓, `invited` dashed blue
      outline with "Convite", `not_coming` faded blue with "Não vou", `attended` faded with ✓,
      `missed` faded; **grey** (`muted-foreground` outline, dashed) for `open_spot` with "Vaga
      livre"; **amber** (`warning`) for `full` — the warning tint with readable amber ink and a
      "Cheia" chip — and for `waiting`, a dotted amber outline with "Em lista de espera".
      `canceled` stays red. One helper in `@levelup/config` (`calendar-card.ts`) resolves card,
      grid block and month dot, so the three never disagree.
    - **Amber means only full.** On the student's calendar the fill bar and the `X/Y` count are
      never amber (`calendar.mobile-views` rule 7 does not apply to a student viewer).
    - **Opening a full class** offers "Juntar-me à lista de espera"
      (`classes.academy-class-booking` rule 6's endpoint, `{model, originalId, date}`); a class the
      student waits for shows "Em lista de espera" instead of the button.
    - **Filter.** At the top of the student's calendar a two-option selector,
      "Todas em que sou elegível" (default) / "Só as minhas aulas" (`calendar-student-filter`).
      "Só as minhas" hides only the offers (`open_spot`, `full`); `enrolled`, `not_coming`,
      `attended`, `missed`, `invited` and `waiting` stay, so the filter never hides an invitation
      that needs an answer. The choice is remembered per student **on each device** (web
      `localStorage`, iOS `AsyncStorage`, keyed by user id); it does not follow the student to
      another device (decision 2026-10-14: no server preference this wave).
    - **Legend.** The student's legend lists the states the filter leaves visible, in the same
      treatments (`calendar-legend`): on desktop as today, and on phones (web below 768px and
      iOS) as one compact row under the filter. This supersedes `calendar.mobile-views` rules 9 and
      19 ("no legend on phones") for the student viewer only — the owner's 2026-10-13 ticket asks
      for a visible legend.
    - **Old clients.** A client that does not declare `full-classes` gets exactly the calendar it got
      before (no `full` events); the colours are a client concern and change nothing on the wire.

### Acceptance Criteria

#### The week starts on Sunday (rule 5a, PAD-682)
- **Given** Wednesday 2026-10-21 on the club clock
- **When** a coach opens the weekly calendar on web and on iOS
- **Then** the first column is Sunday 18 October and the last Saturday 24 October; the month grid
  for October 2026 opens on Sunday 27 September; the presences "esta semana" range is 18–24
  October; and the dashboard's "this week" counts the classes of 18–24 October

#### A coach calendar costs a fixed number of statements (rule 19, PAD-591)
- **Given** a coach with 3 one-off lessons in a 6-week range and another coach with 13, each with
  20 one-off lessons in the past year
- **When** each loads `GET /calendar` for that range under a statement recorder
- **Then** both requests issue the same number of statements, no past lesson outside the range is
  loaded, and each event's `participantCount` equals its roster size

#### Coach calendar view
- **Given** a coach with 3 classes this week and 1 calendar block
- **When** they GET `/api/app/calendar?from=2026-04-13&to=2026-04-19`
- **Then** the response includes all 3 class events and the calendar block
- **And** each event has: id, type, model, originalId, title, date, startTime, endTime, color

#### Player calendar view
- **Given** a player enrolled in 2 classes this week
- **When** they GET `/api/app/calendar?from=2026-04-13&to=2026-04-19`
- **Then** only their enrolled classes appear
- **(PAD-130)** this criterion holds for a coach whose
  visibility toggle is off; the visible case is covered by `eligibility.open-spot-visibility`

#### A student's own class carries a mark that is not a colour (rule 6, PAD-578)
- **Given** a student enrolled in a class coloured `#1355DC` on Monday and eligible for an open spot
  coloured `#1355DC` on Tuesday
- **When** they view that week on desktop web
- **Then** Monday's card and grid block carry `calendar-enrolled-mark` (✓, labelled
  `calendar.eventCard.enrolled`) and Tuesday's carry `calendar-open-spot-chip` and no ✓
- **And** the legend lists `calendar.legend.enrolled` and `calendar.legend.openSpots`
- **And** the coach who teaches both sees neither mark nor the two legend items

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
#### iOS calendar shows the colour legend (PAD-170 C4) — retired by `calendar.mobile-views`
- **Given** a coach on the iOS calendar week view
- **When** they view the calendar
- **Then** a legend row under the week nav explains each colour (`calendar.legend.done / event /
  fill / full / next`), matching web's `CalendarLegend.tsx`
- **And** the week strip and the day-detail list still take equal shares of the space below the nav
  and legend rows — the legend narrows what they divide, it does not tilt the split
- **And** VoiceOver reads the legend as a single element listing the five labels, not as five
  separate stops

#### iOS week strip keeps a constant share of the screen (PAD-172) — retired by `calendar.mobile-views`
- **Given** a coach on the iOS calendar week view
- **When** the visible week has no classes at all
- **Then** the week strip still occupies the same share of the space below the week-nav row as the
  day-detail list below it — it does not collapse to its content height
- **And** on a week whose busiest day has eight classes the strip occupies that same share — it does
  not grow to fit the busiest day
- **And** that day's column scrolls internally to reach the eighth class
- **And** no `+N` more indicator is rendered on iOS, because no class is cut from the column
- **And** the column keeps its scroll indicator visible, since with `+N` gone that is the only signal
  that more classes sit below the fold
- **And** tapping anywhere in a day's column selects that day — including the empty area below the
  chips, and the whole column on a day with no classes at all; the full-height column is one
  day-select target, not just its header

#### Past and next are judged on the club's clock on any device (PAD-295)
- **Given** a device in `Asia/Tokyo` while the club's clock reads 10:00 on a summer day
- **And** two classes today, `08:30–09:30` and `10:30–11:30`
- **When** the coach views the day on web and on iOS
- **Then** the first card is `past` and the second is `next`
- **And** the strip's today ring and `Hoje` land on the club's date, even between 23:00 and 01:00
  Lisbon when the device's date differs

#### A dense day on desktop keeps every class readable (rule 20, B-543)
- **Given** a coach with 22 classes on Wednesday 28 Oct, 60 min each, one every 40 min from 07:00
- **When** they view that week on desktop
- **Then** Wednesday's classes take two columns, each card showing its title and time
- **And** given four classes at 18:00, two cards and a "+2" marker show; the marker lists the other
  two, and choosing one opens its class

#### A late class is whole on the desktop week (rule 21, B-544)
- **Given** a coach with a class on Friday 22:30–00:00 and none before 07:00
- **When** they view that week on desktop
- **Then** the grid runs 07:00 to 24:00 and the class's card is 90 minutes tall with "22:30 – 00:00"
- **And** a week whose classes all sit between 07:00 and 22:00 still shows 07:00–22:00

#### A student's calendar names each class's relation (rule 22, PAD-611)
- **Given** a student enrolled on Monday, who said "Não vou" for Tuesday, holds a live invitation
  for Wednesday's class and an active waiting-list entry for Thursday's
- **When** a client declaring `student-relations` loads that week
- **Then** the events carry `studentRelation` `enrolled`, `not_coming`, `invited` and `waiting`
  respectively, each occurrence once

#### An undeclared client gets no invited or waiting events (rule 22, PAD-611)
- **Given** the same student and week
- **When** a client that does not declare `student-relations` (App Store 1.3.0) loads it
- **Then** no event has `studentRelation` `invited` or `waiting` and the event list is the one it
  got before PAD-611

#### An expired invitation shows nothing (rule 22, PAD-611)
- **Given** a student whose invitation for Wednesday expired, and an inactive waiting-list entry
  for Thursday
- **When** a declaring client loads that week
- **Then** neither Wednesday's nor Thursday's class is on their calendar (unless an open spot)

#### A declaring client sees the eligible full classes (rule 23, PAD-664)
- **Given** a student eligible for two visible future classes of their coach, one with 5 of 6
  filled and one with 6 of 6, and on the waiting list of a third full class
- **When** a client declaring `open-spots`, `student-relations` and `full-classes` loads that week
- **Then** the first carries `studentRelation` `open_spot` and `spotsLeft` 1, the second
  `studentRelation` `full`, `state` `"full"` and `spotsLeft` 0, the third `waiting` — each once
- **And** a client declaring only `open-spots` and `student-relations` gets the first and the
  third, and no event with `studentRelation` `full`

#### The student's three states differ in colour and in a second signal (rule 23, PAD-664)
- **Given** a student with an enrolled class, an eligible class with a spot and an eligible full
  class this week, all taught by a coach whose class colour is teal `#0D9488`
- **When** the shared resolver paints them for the student viewer
- **Then** the enrolled one is solid `primary` with the ✓, the open one a dashed grey outline with
  "Vaga livre", the full one the `warning` tint with "Cheia" — none of them teal
- **And** no fill bar or `X/Y` count on the student's cards is amber
- **And** the same classes on the coach's calendar keep the teal treatment of `calendar.mobile-views` rule 5

#### "Só as minhas aulas" hides offers but never an invitation (rule 23, PAD-664)
- **Given** a student with an enrolled class, a live invitation, an open spot and a full class this week
- **When** they pick "Só as minhas aulas", then reload the page (or reopen the app)
- **Then** the enrolled and invited classes are shown and the open spot and the full class are not
- **And** the selector still reads "Só as minhas aulas" and the legend lists only the states shown

#### Opening a full class offers the waiting list (rule 23, PAD-664)
- **Given** an eligible full class on the student's calendar
- **When** they open it and press "Juntar-me à lista de espera"
- **Then** a waiting-list entry is written for them, and the card turns to "Em lista de espera"

#### Calendar class card is reachable and activatable by keyboard
- **Given** a signed-in coach on `/calendar` viewing a week that contains a class
- **When** they move focus through the page with `Tab`
- **Then** focus lands on the class card, which exposes an accessible name containing the class
  title and its start and end times
- **And** pressing `Enter` on the focused card opens the class detail sheet
- **And** dragging the card to another slot still reschedules it, exactly as before



#### The calendar hook waits for both ends of the range (PAD-348)
- **Given** a screen that calls `useCalendarEvents` before its date is known (`from` and `to` empty)
- **When** it renders
- **Then** no `GET /api/app/calendar` request is made; once the date arrives, exactly one request with that range is made

#### A "this and future" edit reaches the other cards of the week without a reload (rule 18, PAD-526)
- **Given** a class recurring on two days of one week, both cards on the web calendar
- **When** the coach renames the first one "this and future" and saves
- **Then** both cards show the new name, with no page reload
- **When** the coach deletes the first one "this and future"
- **Then** both cards are gone, with no page reload
