# calendar — Calendar View & Blocks

## calendar.view

---
id: calendar.view
status: implemented
depends_on: [classes.instances]
---

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

---

## calendar.blocks

---
id: calendar.blocks
status: implemented
depends_on: [auth.login]
---

### Intent
Users create personal calendar blocks to mark unavailability (breaks, holidays, off-work, personal).

### Entities
- **CalendarBlock** (`calendar_blocks`): user_id, type (break|holiday|off_work|personal|unavailable), start_datetime, end_datetime, is_recurring, recurrence_rule, recurrence_end, blocks_auto_invitations, title, description

### Rules
1. Types: `break`, `holiday`, `off_work`, `personal`, `unavailable`
2. Blocks can be recurring (same recurrence system as lessons)
3. CRUD via: POST/PATCH/DELETE `/api/app/calendar_block/{id}`
4. Blocks have sub-events: `POST /api/app/calendar_block/{id}/event`
5. Blocks can be rescheduled: `POST /api/app/calendar_block/{id}/reschedule`
6. Reschedule supports scope: single occurrence or all future
7. `blocks_auto_invitations` (bool, default false): when true, the block suppresses AUTOMATIC class invitations for the owning user during its window (see calendar.student-blockers)

### Acceptance Criteria

#### Create calendar block
- **Given** an authenticated coach
- **When** they POST to `/api/app/calendar_block` with `{"type": "holiday", "title": "Easter Break", "start_datetime": "2026-04-05T00:00", "end_datetime": "2026-04-07T23:59"}`
- **Then** a CalendarBlock record is created
- **And** it appears on the calendar in the date range

#### Reschedule block
- **Given** a recurring block on Fridays
- **When** coach POSTs to reschedule with `{"occDate": "2026-04-17", "newDate": "2026-04-18", "scope": "single"}`
- **Then** only the April 17 occurrence moves to April 18

---

## calendar.student-blockers

---
id: calendar.student-blockers
status: partial
depends_on: [calendar.blocks, notifications.invitations]
---

### Intent
Students set availability blockers (one-time or recurring) so the smart notification
engine does NOT send them AUTOMATIC class invitations during times they are unavailable.
Reuses the existing CalendarBlock model (type `unavailable`, `blocks_auto_invitations=true`)
rather than a separate table.

### Status correction (2026-08-07)
Only the **PAD-28** half of this spec is implemented: blocker CRUD (rules 1–3) and eligibility-time
filtering of automatic invitation candidates (rule 5, `filter_blocked_coach_players`).

The **PAD-107** half — rules 4, 8, 9, 10 and 11 — is **specced but never landed**. There are no
`PAD-107` references anywhere in the backend, no `POST /api/app/notify/availability_conflicts`
endpoint, no blocked-student skip in `/notify/manual` or `/notify/send_reminders`, and no
blocker backstop in `_send_system_message` (which guards only against empty message text). Those
rules describe intended behaviour, not shipped behaviour, and any spec that leans on them — notably
`notifications.student-block-preferences` — inherits the gap.

### Entities
- **CalendarBlock** (reused): student blockers are rows with type `unavailable` and `blocks_auto_invitations=true`.

### Rules
1. Students manage blockers from a dedicated `/availability` page (player-only nav item).
2. Blocker CRUD (student-scoped): `GET`/`POST` `/api/app/availability_blockers`, `PUT`/`DELETE` `/api/app/availability_blockers/{id}`. Non-student users get 403.
3. Both one-time and recurring (weekly) blockers are supported, using the same recurrence machinery as calendar blocks.
4. Scope of suppression (PAD-107): a blocker suppresses EVERY class-slot solicitation during its window — automatic invitations, manual invitations, reminders and waiting-list offers. A coach may still ADD the student to a class in that window (enrolment is a coach decision), but only after explicitly confirming a warning, and the student is never notified about it.
5. The auto-invitation eligibility engine (`get_eligible_students` and `_get_eligible_students_for_group`) filters out any candidate whose owning user has a blocker occurrence overlapping the class instance window.
6. Timezone: datetimes stored as UTC; recurring occurrences evaluated against the club / Lisbon timezone.
7. The student's availability view clearly indicates each blocker (title, one-time date or recurring days, time window, and an "unavailable / won't receive auto-invitations" indication).
8. Conflict pre-check (PAD-107): `POST /api/app/notify/availability_conflicts` with `{date, startTime, endTime, playerIds}` returns `{blocked: [{playerId, name}]}` — the subset of those players whose owning user has a blocker overlapping the proposed window. Coach-only (403 otherwise). It returns player names ONLY; blocker titles, descriptions and times are the student's private calendar and are never exposed to the coach.
9. Scheduling warning (PAD-107): when a coach schedules a class whose window overlaps a selected student's blocker, the UI warns before creating and requires explicit confirmation ("O aluno (nome) marcou-se como indisponível nesta hora. Tem a certeza que pretende avançar com ele na aula? Não poderá enviar-lhe notificações neste período por ele estar marcado como indisponível e não querer ser incomodado."). Cancelling aborts the create; confirming creates the class normally. For a recurring class the check is evaluated on the first occurrence.
10. Send-time block (PAD-107): `POST /api/app/notify/manual` and `POST /api/app/notify/send_reminders` SKIP blocked students, still deliver to everyone else, and return `{sent, blocked: [{playerId, name}]}`. The UI surfaces "Não pode enviar notificações ao aluno (nome) neste horário, pois ele marcou-se como indisponível."
11. Hard backstop (PAD-107): `_send_system_message` refuses to deliver any `notification_invite`, `notification_reminder` or `waiting_list_offer` bound to a lesson instance whose window overlaps a blocker of the recipient. This is the single delivery choke point, so it also covers the APScheduler reminder job, the auto-invitation rounds and the waiting-list cascade — not just the coach-facing buttons. Neither the chat message nor the web/Expo push is created.
12. The window compared is always the CLASS INSTANCE window (`start_datetime`/`end_datetime`), never the moment the notification is sent.
13. Mobile-responsive (PAD-119): the `/availability` page fits within the viewport at small screen widths (≥320px) — the document never scrolls horizontally, and every control, notably the "Add blocker" action, is fully visible without horizontal scrolling. The page header stacks vertically below the `sm` breakpoint rather than forcing the title and the action button onto one row.

### Acceptance Criteria

#### Blocker suppresses auto-invitation
- **Given** a student with an `unavailable` blocker overlapping a class instance window
- **When** the invitation engine computes eligibility for that instance's vacancy
- **Then** the student is NOT in the eligible list

#### Non-overlapping blocker does not suppress
- **Given** a student whose only blocker does not overlap the class window
- **When** eligibility is computed
- **Then** the student IS eligible

#### Coach is warned when scheduling into a blocked window
- **Given** a coach creating a class at a time overlapping a selected student's blocker
- **When** they submit the class
- **Then** a confirmation warning names the student and states that notifications cannot be sent in that period
- **And** cancelling aborts the create; confirming creates the class with that student enrolled

#### Manual notification to a blocked student is refused
- **Given** an enrolled student with a blocker overlapping the class window
- **When** the coach clicks "Lembrar" or manually notifies that student
- **Then** no message, web push or Expo push reaches that student
- **And** the response reports them under `blocked` and the UI shows the "cannot send notifications" warning
- **And** other enrolled students who are not blocked still receive their notification

#### Blocked student is never reached by any class-slot notification
- **Given** a student with a blocker overlapping a class instance window
- **When** any path fires (auto invitation round, scheduler reminder, waiting-list offer, manual send)
- **Then** no `Message` is created for that student for that instance and no push is dispatched

#### Student manages blockers
- **Given** an authenticated student
- **When** they open `/availability`
- **Then** they can create, edit, and delete one-time and recurring blockers
- **And** each blocker is clearly shown as an unavailable window

#### Availability page fits the mobile viewport
- **Given** an authenticated student on a mobile-width viewport (375px)
- **When** they open `/availability`, with and without the blocker form expanded
- **Then** the document does not scroll horizontally (`documentElement.scrollWidth <= clientWidth`)
- **And** the "Add blocker" button is fully inside the viewport (its right edge is within the viewport width)

---

## calendar.drag-drop

---
id: calendar.drag-drop
status: implemented
depends_on: [calendar.view, classes.edit, calendar.blocks]
---

### Intent
Coaches can drag and drop events on the calendar to reschedule them, with a confirmation dialog for scope selection.

### Rules
1. Drag a class event → triggers `editClass()` with new date/time
2. Drag a block event → triggers `rescheduleCalendarBlock()`
3. For recurring events, a dialog asks: "single" or "future" scope
4. Frontend only — calls existing edit/reschedule APIs

### Acceptance Criteria

#### Drag class to new time
- **Given** a class on Monday 10:00 displayed on the calendar
- **When** coach drags it to Tuesday 14:00 and confirms scope "single"
- **Then** that occurrence is rescheduled to Tuesday 14:00

---

## calendar.event-detail

---
id: calendar.event-detail
status: implemented
depends_on: [calendar.view]
---

### Intent
Clicking a calendar event opens a detail sheet showing full information and available actions.

### Rules
1. Class events open `ClassDetailSheet`: participants, attendance, edit, delete, notify buttons
2. Block events open `EventDetailSheet`: view/edit block details
3. ClassDetailSheet shows: title, date, time, level, "Participants (X/Y)", presence list
4. Actions available: Mark attendance, Edit, Delete, Notify, Training planning
5. The "capacity" field shows effective filled spots over `maxPlayers` — the same value as the calendar event card's `X/Y` (see calendar.view rules 8–9). Declined students are excluded from both
6. The class-detail "invited" (convidados) list is keyed by STUDENT, not by invite record. A student who received several `NotificationEvent` rows for the same instance (multiple rounds, a manual invite plus an automatic one, a re-invite after a decline — all legitimate per notifications.invitations) appears exactly ONCE. The `invitations` array returned by the class-detail payload therefore contains at most one entry per `playerId`
7. De-duplication happens in the backend serializer (`serialize_class_instance`) so every surface — web detail sheet, mobile — sees the same one-row-per-student list. No client performs its own de-duplication
8. Tie-break when a student has several invite records for the same instance: the entry that survives is the one carrying the most meaningful state, ranked `confirmed` > `expired` (an explicit decline) > `sent` (pending) > `queued` (not yet sent). An actual response always beats a still-pending invite. Within the same status rank the most recent record wins (highest `round_number`, then highest `id`). The surviving entry keeps that record's own `id`, so coach response actions still target a real `NotificationEvent`
9. The collapsed "Invited (N)" header counts distinct students, so N equals the number of rows revealed when the section is expanded
10. The calendar page accepts a deep link `/calendar?classId=<calendar-event-id>&date=<YYYY-MM-DD>`
    (see dashboard.navigation rule 8). On mount it MUST:
    - select the week containing `date` BEFORE deciding what to open, so the target occurrence is
      actually loaded even when it lies outside the current week
    - open `ClassDetailSheet` for the event whose `id` equals `classId` once that week's events
      have loaded
11. The deep-link query params are consumed once: after the sheet opens, they are stripped from the
    URL with a history REPLACE. Closing the sheet must therefore leave the coach on the correct
    week with no sheet, and must not immediately re-open it
12. A `classId` that matches no event in the target week is a no-op: the calendar still shows the
    requested week, no sheet opens, and no error is surfaced. `date` alone (no `classId`) simply
    selects that week

### Acceptance Criteria

#### Deep link opens the class in its own week
- **Given** a coach with a class on a day in a later week than today's
- **When** they open `/calendar?classId=<that event's id>&date=<that class's date>`
- **Then** the calendar shows the week containing that date and the class detail sheet for that
  occurrence is open
- **And** the query params are gone from the URL, so closing the sheet does not re-open it

#### Repeatedly invited student appears once in the guest list
- **Given** a class instance where student Bob has three `NotificationEvent` rows (round 1 `expired`, round 2 `sent`, a manual `sent`) and student Alice has one `sent` row
- **When** the coach opens that class's detail sheet and expands the invited section
- **Then** the invited list shows exactly two rows, one for Bob and one for Alice
- **And** the collapsed header reads "Invited (2)"

#### A response outranks a pending invite for the same student
- **Given** a student with both a `confirmed` invite and a later `sent` invite for the same instance
- **When** the class-detail payload is serialized
- **Then** that student's single entry has status `confirmed`

---

## calendar.slot-click

---
id: calendar.slot-click
status: implemented
depends_on: [calendar.view, classes.create]
---

### Intent
Coaches can click an empty calendar slot — or click and drag across a run of consecutive empty
slots — to create a new class, with the date/time pre-populated.

### Rules
1. Clicking empty slot opens `AddClassSheet` with pre-filled date and time
2. Only available for coaches (not players)
3. Uses `canManageClasses` permission check
4. Slot selection (PAD-106) is a **drag**, not a click: pressing the mouse on an empty half-hour
   slot anchors a selection, moving the mouse extends it, and releasing resolves it. A plain click
   is the zero-length case of that same gesture — there is no separate click code path
5. A selection spanning a single half-hour slot resolves exactly as rule 1 did: `AddClassSheet`
   opens with the date and that slot's start time, and the end time keeps its existing default
   (start + 90 min). Single-click behaviour is unchanged
6. A selection spanning two or more slots opens the same `AddClassSheet` with the date, the
   selection's start time, AND an end time equal to **the last covered slot's start + 30 minutes**.
   Dragging 10:00 → 10:30 therefore prefills 10:00–11:00, not 10:00–10:30
7. The selection is normalised: dragging upward (release above the anchor) yields the same range as
   dragging downward across the same slots — start is always the earlier time
8. The selection is locked to the day column the drag started in. Horizontal movement is ignored;
   a range never spans two days
9. While a selection is in progress the covered slots are highlighted so the coach sees the range
   before releasing
10. A drag that starts on an existing event does not begin a selection — the event's own
    click/drag-to-reschedule behaviour (calendar.view) wins. A selection may still be dragged
    *over* an occupied slot; overlap is surfaced afterwards by the existing non-blocking overlap
    warning in `AddClassSheet` (PAD-99) rather than blocking the gesture
11. Pressing `Escape` mid-drag cancels the selection outright: no modal opens and no highlight is
    left behind. Releasing the mouse **outside** the grid is not a cancel — the selection resolves
    using the last slot the pointer was over inside the origin column (an accidental overshoot must
    not throw the gesture away) — but it must clear the highlight and every drag listener, so no
    state dangles either way
12. Desktop only. The gesture is mouse-driven and lives in `CalendarGrid`, which is rendered solely
    in the non-mobile branch of `CalendarPage`; `MobileCalendarView` gains no touch or pointer
    handlers, so touch devices are unaffected

### Acceptance Criteria

#### Drag across consecutive slots prefills the range
- **Given** a coach on the desktop weekly calendar
- **When** they press the mouse on the 10:00 slot of a day, drag down to the 11:30 slot, and release
- **Then** `AddClassSheet` opens with that day's date, start time `10:00` and end time `12:00`

#### Dragging upward normalises the range
- **Given** a coach on the desktop weekly calendar
- **When** they press on the 11:30 slot and drag up to the 10:00 slot before releasing
- **Then** the sheet opens with start time `10:00` and end time `12:00` — identical to the downward drag

#### Single click is unchanged
- **Given** a coach on the desktop weekly calendar
- **When** they click a single empty slot without moving the mouse
- **Then** `AddClassSheet` opens with that day's date and that slot's start time
- **And** the end time is the pre-existing default (start + 90 min), not start + 30 min

#### Escape cancels an in-progress selection
- **Given** a coach who has pressed the mouse on a slot and dragged across two more
- **When** they press `Escape` before releasing
- **Then** no modal opens and the range highlight disappears

#### Releasing outside the grid still resolves, and leaves nothing behind
- **Given** a coach who has dragged from 08:00 down to 09:00 and then moved the pointer sideways
  off the grid entirely, level with the 09:00 slot
- **When** they release the mouse there
- **Then** the sheet opens with the last in-grid range (08:00–09:30)
- **And** no range highlight remains on the calendar

---

## calendar.seasons

---
id: calendar.seasons
status: implemented
depends_on: [calendar.view, classes.create]
---

### Intent
A coach defines named "seasons" (a name plus an absolute start and end date) in Settings → Calendar.
A recurring class can then be set to "recur until season end" instead of carrying a manually typed end
date, and instance generation stops at the owning coach's season end.

Seasons shipped with PAD-8 but were never specced; PAD-89 closes that gap and fixes the write contract.
The batch write path treated an omission as a deletion — a persisted season absent from the payload was
silently destroyed rather than validated against — while the DB-aware overlap validator that PAD-8
shipped (`validate_no_overlap`) was never called by any production code path. Because the web client
never sent `id`, every "Save seasons" click deleted and re-created the coach's entire set.

### Entities
- **Season** (`seasons`): `id`, `coach_id` (FK → `coaches.id`, ON DELETE CASCADE), `name`, `start_date`,
  `end_date`. Owned by exactly one coach. Nothing else in the schema references a season by id.

### Rules
1. A coach's seasons must never overlap. The check is inclusive: two ranges overlap when
   `start_a <= end_b and start_b <= end_a`. Adjacent ranges (one starting the day after the other ends)
   do not overlap.
2. `start_date` must be on or before `end_date`.
3. `POST /app/add_seasons` is a **pure upsert**. An entry carrying an `id` owned by the coach updates
   that season in place, preserving its identity and `created_at`; an entry without an `id` creates one.
4. **Explicit deletes only.** A persisted season the payload does not mention is left untouched. Batch
   save never deletes. Removal happens solely through `POST /app/delete/season`.
5. Overlap validation runs in two passes before anything is written: pairwise across the incoming
   payload, then — via the DB-aware validator — each entry against the coach's persisted seasons that
   the payload does not address. Seasons the payload *does* address are excluded from the second pass so
   a season is never treated as overlapping its own stale range.
6. Any violation rejects the **whole batch** with 400 and writes nothing. A payload can never resolve an
   overlap by destroying the season it collides with.
7. The web client sends `id` for every already-persisted row so rule 3 applies; locally-added rows are
   posted without one.
8. **"Recurs until season end" fails closed.** When a class is created with `recursUntilSeasonEnd`,
   `POST /app/add_class` resolves the coach's season covering the class's start date and snapshots that
   season's `end_date` into `lessons.recurrence_end`. If no season covers that date, the create is
   rejected with 400 and `{"error": …, "code": "no_season_covers_date"}`; no lesson, instance or
   reminder job is written. A fallback horizon is deliberately NOT used — a silently invented end date
   is as surprising as no end date.
9. **`recurs_until_season_end` implies a bounded recurrence.** A lesson flagged
   `recurs_until_season_end` must never carry a NULL `recurrence_end`. NULL is read everywhere
   downstream (`helpers/calendar_helpers.py`) as "no end", which makes the class recur forever.
10. The coach-facing surface (`AddClassSheet`) presents a `no_season_covers_date` rejection **in
    place**: the sheet stays open with every field intact and renders a localized message beside the
    toggle telling the coach to set a season or turn the toggle off and pick an end date. It is not a
    toast — a toast disappears and the sheet would already have closed over a class that was never
    created.

### Acceptance Criteria

#### A season omitted from the payload survives
- **Given** a coach with a persisted season "Existing" (2026-03-01 → 2026-05-31)
- **When** they save a payload containing only a new, non-overlapping season "Autumn" (2026-09-01 → 2026-12-31)
- **Then** the request succeeds
- **And** both "Existing" and "Autumn" are present afterwards

#### A new season overlapping an omitted persisted season is rejected
- **Given** a coach with a persisted season "Existing" (2026-03-01 → 2026-05-31)
- **When** they save a payload containing only "New" (2026-05-15 → 2026-08-01)
- **Then** the response status is 400 with "Overlapping seasons are not allowed"
- **And** "Existing" is still present and "New" was not created

#### A season can be moved over its own former range
- **Given** a coach's persisted season "Spring" (2026-03-01 → 2026-05-31)
- **When** they save it by `id` with the range 2026-03-15 → 2026-06-30
- **Then** the save succeeds and the row keeps its original `id`

#### Two overlapping seasons in one payload are rejected
- **Given** any coach
- **When** they save 2026-03-01 → 2026-05-31 together with 2026-05-15 → 2026-08-01
- **Then** the response status is 400 and neither season is created

#### Removal is explicit
- **Given** a coach with two seasons
- **When** they delete one through `POST /app/delete/season`
- **Then** only that season is removed and the other is untouched

#### Persisted rows are saved in place
- **Given** a coach with a persisted season shown in Settings → Calendar
- **When** they click "Save seasons"
- **Then** the posted payload carries that season's `id`

#### "Recurs until season end" with no season at all is rejected
- **Given** a coach with zero seasons (the default state)
- **When** they create a recurring class with `recursUntilSeasonEnd: true`
- **Then** the response status is 400 with `code: "no_season_covers_date"`
- **And** no lesson is created

#### "Recurs until season end" outside every season is rejected
- **Given** a coach whose only season is 2026-01-01 → 2026-05-31
- **When** they create a recurring class starting 2026-06-15 with `recursUntilSeasonEnd: true`
- **Then** the response status is 400 and no lesson is created

#### A covering season bounds the recurrence
- **Given** a coach with a season 2026-06-01 → 2026-09-30
- **When** they create a recurring class starting 2026-06-15 with `recursUntilSeasonEnd: true`
- **Then** the lesson is created with `recurrence_end` = 2026-09-30

#### The coach is told in the sheet, not by a vanishing toast
- **Given** a coach creating a recurring class on a date no season covers
- **When** they enable "recurs until season end" and submit
- **Then** the Add Class sheet stays open with the class name and other fields intact
- **And** a message beside the toggle explains that no season covers this date
- **And** turning the toggle off clears the message, and picking an end date lets the class save

### Notes
- Source: tickets PAD-8 (feature), PAD-89 (write-contract fix), PAD-90 (fail-closed resolution),
  PAD-83 (investigation).
- Rules 8–10 cover the create path only (`add_class_service`); no edit path can set
  `recurs_until_season_end`.
- The DB has no unique/exclusion/check constraint on `seasons` — rules 1–2 are enforced only in the
  service layer, so the generic-CRUD write paths bypass them entirely (tracked separately as PAD-88).
- PAD-82 will replace this multi-row model with a single recurring day/month season per coach. The
  contract above is deliberately forward-compatible: an upsert that never deletes and a validator that
  actually runs both survive that redesign unchanged.
