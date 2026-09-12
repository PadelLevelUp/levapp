---
id: attendance.confirm
status: implemented
depends_on: [attendance.presence]
implements: ../../specs-business/attendance/player-confirms-and-manages-attendance.business.md
governed_by: []
---

# attendance.confirm


### Intent
Players confirm or decline their attendance in response to a reminder notification.

### Rules
1. Player responds to reminder via `POST /api/app/notify/respond_reminder`
2. Action: `yes` → confirmed=True, `no` → removes from instance
3. Confirmation updates the Presence record
4. After confirming (`yes`), a player may cancel their attendance at any time BEFORE the class start time via `POST /api/app/notify/cancel_attendance` with `{lessonInstanceId}`. Cancellation is not offered once the class has started (`now >= instance.start_datetime`)
5. Cancelling reverts the player to "not attending" and frees the spot using the exact same path as a reminder decline (`no`): it reuses the same vacancy-creation and invitation-engine logic — it does not fork a separate path. In automatic mode invitations are (re)triggered/pre-created; in semi-automatic mode the vacancy awaits coach approval before invitations are sent (see notifications.semi-auto-approval)
6. The coach configures a cancellation deadline `cancellationDeadlineHours` (default 24) on their NotificationConfig (see notifications.config). The deadline is `cancellationDeadlineHours` real hours before the class's real start. The stored `start_datetime` is Lisbon wall-clock (R-023), so the deadline is computed on instants and holds across a daylight-saving change (PAD-256). A cancellation made at or after this deadline but still before class start is **allowed** (never blocked) but flagged as a **late cancellation** (`Presence.late_cancellation=True`). A cancellation before the deadline sets `late_cancellation=False`. The spot is freed and invitations (re)triggered identically regardless of lateness
7. The `Presence.late_cancellation` boolean column records whether a cancellation was late. Serialized presence payloads expose `lateCancellation`; the serialized class-instance payload exposes the effective `cancellationDeadlineHours` (and/or a deadline timestamp) so the frontend can render deadline-aware UX. `cancellationDeadline` is a naive ISO string on the club's wall clock, like every class time, and both clients compare it with the club's clock — `lisbonNow()` in `@levelup/config` — never with the device's, so the moment is right on a phone anywhere (PAD-256, PAD-295)
8. When a player cancels attendance (`POST /api/app/notify/cancel_attendance`), the **coach is notified** with exactly one message per cancellation. The notification reuses the existing coach↔player direct conversation / system-message infrastructure (no new channel/model): a message is created in that conversation and its push notification is directed at the coach. The message identifies the **student** (name) and the **class instance** (title + start date/time). When the cancellation is late (`late_cancellation=True`), the notification is clearly marked as a late cancellation both in its human-readable text and via a machine-readable `msg_metadata` marker (`lateCancellation: true`, plus `lessonInstanceId`). Reminder declines (`respond_reminder` with `no`) do not emit this coach cancellation notification — it is specific to the `cancel_attendance` path, which is the only path that computes lateness. The single coach notification is in addition to (and does not replace) the existing student-facing acknowledgement message **PAD-288 (coordinator decision, 2026-09-11 — see rule 23): the message is sent for every cancellation; the coach's phone is pushed only for a LATE one (rule 6). Early cancellations are visible, not noisy.**
9. A student can cancel attendance directly from an enrolled class in the calendar class-detail view (not only from a chat reminder). Both surfaces (the class-detail view and the reminder bubble) call the same `POST /api/app/notify/cancel_attendance` and render deadline-aware UX from the class-instance payload's `cancellationDeadline` / `cancellationDeadlineHours`: before the deadline a normal confirm, at/after the deadline a "late cancellation" warning that still allows the cancel. The action is hidden once the class has started; a 409 is handled gracefully with an error message. "Started" is judged on the club's clock: the stored start against Lisbon now, never UTC — on the server (`club_now_naive()`) and on both clients (`lisbonNow()`, PAD-295)

#### Proactive decline (PAD-73)
10. **Proactive-decline window.** A decline made *before the student would normally have been asked to confirm* is a **proactive decline**. The window closes at the instant the attendance reminder for that instance would fire, i.e. `proactiveDeclineDeadline = _fire_time_utc(instance.start_datetime, config.get_reminder_timing())`, which follows `notifications.reminders` rule 15 (PAD-256) — the **same** helper and the same `reminder_timing.firstReminder` config the scheduler uses to arm the reminder job (see `notifications.reminders`). The cutoff is therefore always derived, never a hardcoded interval, and it moves when the coach changes their reminder timing. When the timing config yields no computable instant, no proactive window exists and today's plain-cancellation behaviour applies unchanged
11. **Same endpoint, server-side classification.** A proactive decline is not a separate endpoint or a separate code path: it is `POST /api/app/notify/cancel_attendance`, which classifies the decline itself from the server clock. The response carries `{"action": "declined", "proactive": true|false}`. The client never decides which kind of decline occurred — a stale client cannot mislabel one
12. **A proactive decline is never a late cancellation.** When `now < proactiveDeclineDeadline`, `Presence.late_cancellation` is forced `False` regardless of `cancellationDeadlineHours`. This matters only when a coach configures a reminder that fires *after* their own cancellation deadline; telling the coach at the earliest moment the system ever expected an answer is by definition not late
13. **Effects of a proactive decline** (all of which reuse the existing shared decline path, `_free_spot_for_declining_player`):
    - the absence is auto-justified — `status="absent"`, `justification="justified"`, `confirmed=True`, exactly the state a reminder decline writes, so `attendance.stats` and `effective_filled_spots` stay coherent;
    - the vacancy is created **immediately** (`_ensure_vacancy_for_player`), so the spot reads as free the moment the student declines, without waiting for the next batch tick;
    - **invitation timing is unchanged**: invitations are only sent when `now >= invitationStart` (`notifications.invitations`). A decline 10 days out pre-creates the vacancy and sends nothing; the existing `invite_start_{instance_id}` job fans out at the configured hour. Semi-automatic mode still routes through coach approval
    - the coach is notified exactly once, with wording that distinguishes a proactive decline from a plain or late cancellation, and a machine-readable `msg_metadata.proactiveDecline` marker alongside the existing `cancellation` / `lateCancellation` / `lessonInstanceId` keys
14. **Authorization.** `cancel_attendance` is authorized on **enrolment**: the acting user must resolve to a `Player` who holds a `Presence` on that instance (the enrolment since PAD-259, `classes.instance-enrollment` rule 1; before PAD-259 the junction row), otherwise 403. On a virtual occurrence the series roster is checked before materialising (rule 18). A student may only ever decline their own enrolment on a class they are actually in (PAD-88 / PAD-115 precedent)
15. **How the invitation-timing guarantee is enforced.** Declining to call `trigger_invitations` is *not* sufficient to hold invitations back: `process_invitation_batches` sweeps every `status="open"` vacancy every two minutes and fires a batch immediately on any vacancy whose `last_activity_at` is `None`. The only thing it defers to is `Vacancy.invite_not_before`. Therefore a vacancy created by a decline that lands **before** `invitationStart` is stamped with `invite_not_before = invitationStart` (the same field the semi-automatic approval path stamps, and the same field `trigger_invitations` and `_send_invitation_batch` already honour). Without this stamp a decline 10 days out would fan out invitations within two minutes, defeating rule 13. This applies to the whole shared decline path (`_free_spot_for_declining_player`), so a reminder decline outside the invitation window is held back too — which is what `notifications.invitations` already specified
16. **Frontend.** ~~The proactive-decline affordance lives in the class-detail **participants** section, on the student's own row, and is shown only while the proactive window is open (`canDeclineProactively`).~~ **Superseded by rule 25 (PAD-313): there is ONE decline action, and the window no longer decides what is rendered.** The payload fields below are unchanged and still describe the *kind* of decline; what they no longer do is choose between two buttons. The class-instance payload exposes `proactiveDeclineDeadline` (a naive ISO-8601 string on the club's wall clock, or null; PAD-256) and `canDeclineProactively` (bool), both computed by the same server helper as rule 10, so the button is never offered when the server would refuse it. ~~Once the window closes the affordance disappears and the existing rule-9 cancel action remains the way to decline (a normal/late cancellation).~~ (Rule 25: one action at every moment; the deadline speaks in the confirmation dialog instead.) After declining, the student's own row shows a persistent "not attending / justified absence" state **derived from their serialized presence** (`status==="absent" && justification==="justified"`), so it survives a reload. All copy goes through `src/locales/{pt,en}/calendar.json`; default locale `pt`. **(PAD-170 C5)** The affordance exists on **both** shells — web's `ClassDetailSheet` and iOS's `app/class/[id].tsx` — under the student's own attendance block, ~~with the same three states: the "I can't attend" button plus its hint while the window is open, the persistent "not attending / justified absence" panel once declined, and the plain rule-9 cancel action once the window has closed.~~ (Rule 25: one button, one state badge.) iOS reads `canDeclineProactively` from the same payload and never re-derives the reminder instant, so a phone can no more offer the action out of window than the browser can
17. **Owner only (PAD-258, audit H4).** `POST /api/app/class_instance/presences/confirm` resolves
   the target the same way the service does (`originalId` + the calendar-event id prefix /
   `parentClassId`) and requires the calling coach to own it (`require_owned_class`, PAD-92)
   BEFORE anything is materialised or written; 403 otherwise. Every `playerId` in the payload
   must be enrolled in that class or on the caller's roster — an arbitrary id is 403, not an
   upsert.

#### Early cancellation on an occurrence that has no row yet (PAD-288, PAD-282; rule numbers 18–20 self-assigned by Session H on 2026-09-11, unconfirmed)
18. **Materialise on demand (owner decision, 2026-09-11).** `POST /api/app/notify/cancel_attendance`
   accepts either `{lessonInstanceId}` (unchanged) or `{model, originalId, date}` exactly as the
   calendar event carries them (`model` is `Lesson` or `LessonInstance`). With the second shape the
   server resolves the occurrence the way a join request does (`classes.join-requests` rule 2,
   `resolve_instance`): a `Lesson` occurrence with no instance row is **authorised first, then
   materialised** — the acting student must be on the lesson's roster (`Association_PlayerLesson`)
   before anything is created, so a non-enrolled student can never cause a materialisation (403,
   nothing written); once enrolled, `get_or_materialize_instance` creates the row and every roster
   presence (`classes.instances` rule 2), and the cancel then proceeds on the instance exactly as
   rules 4–15 describe. A `date` the recurrence does not produce is 404; a date whose start has
   passed is 409 (rule 4). This closes PAD-282: a class created from a student's own request for
   the next day never gets a reminder job (its fire time is already past), so nothing ever
   materialised it and the cancel had no instance to attach to.
19. **How far ahead, and what kind of decline it is.** Any future occurrence the student can see on
   their calendar may be cancelled — there is no upper bound beyond the recurrence itself. A cancel
   ahead of the reminder is, by rule 10, a **proactive decline**: never late (rule 12), the spot
   freed at once, invitations held to `invitationStart` through `invite_not_before` (rule 15), the
   coach told exactly once (rules 8 and 13). No new state, column or endpoint. Leaving the whole
   series is not this action (`classes.enrollment`); undoing a cancellation is not offered — the
   student asks the coach, or joins back through `classes.join-requests`.
20. **Clients.** Web (`ClassDetailSheet`) and iOS (`app/class/[id].tsx`) offer the rule-9 cancel
   action (rule 25: the rule-16 proactive affordance is gone) on a class event whether it is a materialised instance or
   a virtual occurrence: the gate is "I am a participant, the class has not started, I have not
   declined", never "an instance id or a presence row exists". Both send `(model, originalId,
   date)` from the event and read `cancellationDeadline`, `cancellationDeadlineHours`,
   `proactiveDeclineDeadline` and `canDeclineProactively` from the class-instance payload, which
   the server now also computes for a `Lesson` occurrence (`POST /class_instance?model=Lesson&id&date`)
   from that occurrence's start and the coach's config. After a cancel the client re-reads the
   payload, which now resolves to the materialised instance and carries the student's presence, so
   state renders from server data as before — as the single `attendanceState` badge of rule 25.
   `canDeclineProactively` is no longer a client render condition; the server still computes it
   and still classifies the decline, and the client uses the `proactive` key of the reply only to
   choose the confirmation copy and the toast.

#### Early cancellation — product rules (PAD-288; decided by the coordinator on 2026-09-11 while the owner slept; stated verbatim so a reversal is one edit; rule numbers 21–24 self-assigned by Session J, unconfirmed)
21. **How far ahead.** "A student who is planned in an occurrence may cancel ANY future occurrence
    from the class detail — no horizon limit (the founders' example was a week ahead; nothing in
    the domain justifies a cap)." Rules 18–20 are the mechanism: the occurrence is resolved from
    the calendar event and materialised on demand, authorised on the series roster.
22. **What it frees.** "Cancelling frees the spot immediately: the vacancy opens and the engine
    invites per its normal rules (no special-casing early cancellations)." That is rule 5's shared
    decline path and, ahead of the reminder, rule 13's proactive decline with invitations held to
    `invitationStart` (rule 15) — the engine's own timing, nothing added.
23. **Who is told, and how.** "The coach is PUSHED only for LATE cancellations (the existing
    deadline rule, unchanged). Early cancellations appear in the class detail / Presences as
    'cancelled by the student' with the timestamp — visible, not noisy." Concretely: rule 8's
    chat message is sent for every cancellation, the web and native push only when
    `late_cancellation` is true; and a serialized presence carries `cancelledByStudent`
    (`status = absent` ∧ `justification = justified` ∧ `validated = false` — the shape only the
    student's own decline produces before the coach validates the sheet) and `cancelledAt` (the
    row's `updated_at` as a UTC instant, which the decline write sets; a later coach edit of that
    row replaces it and validating the sheet ends the label, since the sheet's own state then
    speaks). Both shells show "cancelled by the student · <date time>" on that participant's row
    in the class detail (coach view) and under the student's own "not attending" state.
24. **No undo, same rule for requested classes.** "No undo: the student asks the coach or books
    again through a request. A class the student REQUESTED (PAD-282) follows exactly the same
    rule." No endpoint reverses a cancellation; `classes.join-requests` is the way back.

25. **One way to say "I am not coming", one state word (PAD-313; number self-assigned,
   unconfirmed; decided by the coordinator 2026-09-12 after a founder's TestFlight 20 report).**
   Verbatim, so a reversal is one edit: *"a student must see ONE way to say 'I am not coming' per
   class, same label wherever it appears"*; *"the consequence goes in the confirmation dialog, not
   in the choice of button"*; *"ONE badge per row"*; *"no row ever shows two state words at once"*.
   Concretely, on both shells:
   - The only decline affordance is the rule-9 cancel action, labelled **"Não vou poder ir"**
     (`calendar.detail.proactiveDecline`) — the person's own words; "Cancelar presença" was systems
     language and is retired as a label. Its gate is the rule-9/20 gate alone: a participant, the
     class has not started, not already declined.
   - The deadline is carried by the **confirmation dialog**: past the deadline it says plainly that
     the cancellation is late and the coach will be told; before it, it does not. The server's
     `proactive` reply chooses the toast. Neither ever decides which button to draw.
   - A row shows exactly ONE state word, from `attendanceState` (`attendance.presence` rule 9,
     PAD-313's server half) through the shared helper `@levelup/config`'s `attendance-state`, so the
     two shells cannot drift. Clients no longer read `confirmed`, `status`, `justification` or
     `validated` to decide what to show. Labels (PT, approved 2026-09-12): `planned` "Inscrito",
     `coming` "Vais" (student) / "Vai" (coach), `not_coming` "Não vais — falta justificada" /
     "Não vai — falta justificada", `attended` "Presente", `missed` "Faltou". The student's own row
     speaks in the second person, the coach's participant row about the student.
   - **Rule 23's `cancelledByStudent` stays a separate, narrower fact and never becomes a state.**
     `not_coming` says WHAT, never WHO. On the coach's row only, and only while the row is not
     validated, "Cancelado pelo aluno · <when>" is rendered as a **detail line in secondary text**,
     with clearly lesser weight than the state word — a quiet fact beside one status, never a
     second status. The student's own row never shows it: they know they cancelled.

### Acceptance Criteria

#### Player confirms attendance
- **Given** a player with a pending reminder for instance 10
- **When** they POST to respond with action `yes`
- **Then** their presence.confirmed becomes True

#### Player declines attendance
- **Given** a player with a pending reminder for instance 10
- **When** they POST to respond with action `no`
- **Then** their presence is updated (or removed)
- **And** a vacancy may be created for the notification engine (in semi-automatic mode the vacancy awaits coach approval before invitations are sent — see notifications.semi-auto-approval)

#### Player cancels attendance after confirming (before class start)
- **Given** a player who previously confirmed attendance for instance 10 whose class has not yet started
- **When** they POST to `/api/app/notify/cancel_attendance` with `{lessonInstanceId: 10}`
- **Then** their presence is reverted to "not attending" (status=absent, justification=justified) exactly as a reminder decline
- **And** the freed spot re-triggers the existing open-spot / invitation-engine logic, identical to a reminder decline (no separate path)

#### Student cancels from the calendar class-detail view (before deadline)
- **Given** a student enrolled in a future class (its start more than `cancellationDeadlineHours` away) who opens the class in the calendar class-detail view
- **When** they use the "Cancel attendance" action shown for their enrolled class
- **Then** the app calls `POST /api/app/notify/cancel_attendance` with the instance id, their spot is freed, and their view reflects the cancellation — matching the reminder-bubble cancel behavior

#### Cancellation blocked after class start
- **Given** a player who confirmed attendance for an instance whose start_datetime is in the past
- **When** they POST to `/api/app/notify/cancel_attendance` for that instance
- **Then** the request is rejected (409) and the presence is unchanged

#### Cancellation before the deadline is not flagged late
- **Given** a coach with the default `cancellationDeadlineHours` of 24 and a player who confirmed attendance for an instance whose start is more than 24h away
- **When** the player cancels via `POST /api/app/notify/cancel_attendance`
- **Then** the cancellation succeeds, `presence.late_cancellation=False`, and the freed spot re-triggers the invitation engine

#### Cancellation windows run on the club's clock in summer and winter (PAD-256)
- **Given** a class stored at 10:00 on 2026-07-14 (Lisbon summer, UTC+1) and the default
  `cancellationDeadlineHours` of 24
- **When** the student cancels at 09:30 UTC on 2026-07-13 (10:30 Lisbon, 23.5 h before the class)
- **Then** the cancellation is flagged late
- **And** at 09:30 UTC on 2026-07-14 (10:30 Lisbon) the cancellation is refused with 409, because the
  class has started
- **And** for a class stored at 10:00 on 2026-01-13 (winter, UTC+0), the same UTC moments are 24.5 h
  and 0.5 h before the class: not late, and still allowed
- **And** the proactive-decline window of a 48 h reminder closes at 09:00 UTC on 2026-07-12 (10:00
  Lisbon) in summer and at 10:00 UTC on 2026-01-11 in winter
- **And** across the spring change, a class stored at 10:00 on 2026-03-30 exposes
  `proactiveDeclineDeadline` `2026-03-28T09:00:00`: 48 real hours earlier, on the club's wall clock

#### Late cancellation is allowed but flagged
- **Given** a player who confirmed attendance for an instance whose start is less than `cancellationDeadlineHours` away but still in the future
- **When** the player cancels via `POST /api/app/notify/cancel_attendance`
- **Then** the cancellation is allowed (not blocked), `presence.late_cancellation=True`, and the freed spot still re-triggers the invitation engine

#### Coach is notified on a (non-late) cancellation
- **Given** a player who confirmed attendance for an instance whose start is more than `cancellationDeadlineHours` away
- **When** the player cancels via `POST /api/app/notify/cancel_attendance`
- **Then** exactly one coach-facing notification is produced in the coach↔player conversation
- **And** no push notification is sent to the coach (PAD-288, rule 23)
- **And** it identifies the student (name) and the class instance (title + start date/time)
- **And** it is NOT marked as a late cancellation (`msg_metadata.lateCancellation` is false)

#### Coach is notified and the late flag is set on a late cancellation
- **Given** a player who confirmed attendance for an instance whose start is less than `cancellationDeadlineHours` away but still in the future
- **When** the player cancels via `POST /api/app/notify/cancel_attendance`
- **Then** exactly one coach-facing notification is produced (no duplicate)
- **And** it is marked as a late cancellation in both its text and `msg_metadata.lateCancellation=true`
- **And** the coach is pushed exactly once (PAD-288, rule 23)

#### Proactive decline before the reminder time (PAD-73)
- **Given** a coach whose `reminder_timing.firstReminder` is `{type: "hours_before", value: 48}` and a student enrolled in an instance that starts in 10 days
- **When** the student POSTs `/api/app/notify/cancel_attendance` with that instance id
- **Then** the response is `{"action": "declined", "proactive": true}`
- **And** the presence becomes `status="absent"`, `justification="justified"`, `late_cancellation=False`
- **And** an open `Vacancy` for that instance exists immediately
- **And** no invitation message has been sent to any other student, because `invitationStart` (24h before) has not been reached

#### The window closes at the reminder time, not at a fixed interval
- **Given** the same coach and an instance that starts in 10 hours (so the 48h reminder instant has passed)
- **When** the student POSTs `/api/app/notify/cancel_attendance`
- **Then** the cancellation still succeeds but the response is `{"action": "declined", "proactive": false}`
- **And** the coach's notification is not marked as a proactive decline
- **And** raising the coach's `firstReminder` to `{type: "hours_before", value: 240}` moves the cutoff accordingly — the same 10-day-out instance is then no longer proactive

#### Class-instance payload exposes the proactive window
- **Given** a student enrolled in an instance further out than the coach's first-reminder instant
- **When** they load the class-instance detail payload
- **Then** it contains `proactiveDeclineDeadline` (the ISO-8601 reminder instant) and `canDeclineProactively: true`
- **And** for an instance inside the reminder window, `canDeclineProactively` is `false`

#### Student proactively declines from the participants section
- **Given** a student who opens a future class in the calendar class-detail view while the proactive window is open
- **When** they use the "I can't attend" action on their own row in the participants section
- **Then** `POST /api/app/notify/cancel_attendance` is called, their spot is freed, and their row shows a "not attending" state that persists across a reload
- **And** the same action, hint and post-decline state are present on iOS (PAD-170 C5), reading the
  same `canDeclineProactively` flag
- **And** with the window closed on either shell the action is absent and only the plain
  cancel-attendance action remains

#### A non-enrolled student cannot decline someone else's class
- **Given** a signed-in student who is NOT enrolled in instance 10
- **When** they POST `/api/app/notify/cancel_attendance` with `{lessonInstanceId: 10}`
- **Then** the request is rejected with 403
- **And** no `Vacancy` is created and no invitation fan-out is triggered for that instance

#### Student cancels a class they requested for tomorrow (PAD-282)
- **Given** a student whose class request for tomorrow 10:00–11:00 the coach accepted, so a one-off
  `private` lesson exists with the student on its roster, no `LessonInstance` row, and no reminder
  job (its fire time was already past at accept)
- **When** the student POSTs `/api/app/notify/cancel_attendance` with `{model: "Lesson",
  originalId: <lesson id>, date: <tomorrow>}`
- **Then** the response is 200 `{"action": "declined", "proactive": false|true}`
- **And** exactly one `LessonInstance` now exists for that lesson and date, with the student's
  presence `status=absent, justification=justified`
- **And** the coach receives exactly one cancellation message (rule 8)

#### Student cancels an occurrence ten days ahead (PAD-288)
- **Given** a recurring Monday class with Alice and Bob on the roster, reminders at 48h and
  invitations opening 24h before, and no instance row for the Monday ten days out
- **When** Alice POSTs `/api/app/notify/cancel_attendance` with `{model: "Lesson", originalId:
  <lesson id>, date: <that Monday>}` on the Friday before
- **Then** the instance for that Monday is materialised with presences for Alice and Bob
- **And** the response is `{"action": "declined", "proactive": true}` and Alice's
  `late_cancellation` is false
- **And** one open `Vacancy` exists for Alice with `invite_not_before` equal to that occurrence's
  `invitationStart`, and no invitation has been sent

#### The class-detail payload offers the cancel action on a virtual occurrence
- **Given** the PAD-282 setup above
- **When** the student POSTs `/api/app/class_instance?model=Lesson&id=<lesson id>&date=<tomorrow>`
- **Then** the payload carries `cancellationDeadline`, `cancellationDeadlineHours`,
  `proactiveDeclineDeadline` and `canDeclineProactively` computed for that date
- **And** the web class-detail sheet and the iOS class screen both show the cancel action (rule 20)

#### A student off the roster cannot materialise an occurrence by cancelling
- **Given** a signed-in student who is not on the roster of recurring lesson 7
- **When** they POST `/api/app/notify/cancel_attendance` with `{model: "Lesson", originalId: 7,
  date: <next Monday>}`
- **Then** the request is rejected with 403
- **And** no `LessonInstance`, `Presence` or `Vacancy` row is created

#### A date the recurrence does not produce is refused
- **Given** recurring lesson 7 on Mondays and a student on its roster
- **When** they POST `/api/app/notify/cancel_attendance` with `{model: "Lesson", originalId: 7,
  date: <next Tuesday>}`
- **Then** the request is rejected with 404 and nothing is materialised

#### Started and late cancellation are judged on the club's clock on any device (PAD-295)
- **Given** a device whose zone is `Asia/Tokyo` (UTC+9) while the club's clock reads 10:00 on
  15 July 2027 (summer, UTC+1)
- **And** an enrolled class today at `10:30` whose `cancellationDeadline` is `2027-07-15T09:45:00`
- **When** the student opens the class detail on web and on iOS
- **Then** the class has not started: cancel attendance is offered, flagged as a late cancellation
- **And** a class at `09:30` today has started: the action is hidden

#### Cancellation deadline config default and round-trip
- **Given** a coach with no explicit deadline set
- **When** they GET `/api/app/notify/config`
- **Then** `cancellationDeadlineHours` is 24
- **And** POSTing a new value persists and is returned on the next GET

#### A cancellation a month ahead is accepted and shows as cancelled by the student (PAD-288)
- **Given** a student on the roster of a class thirty days out, reminders at 48 h, cancellation deadline 24 h
- **When** they cancel from the class detail
- **Then** the response is `{"action": "declined", "proactive": true}`, the spot is freed (an open vacancy with `invite_not_before` at that occurrence's `invitationStart`), the coach gets one chat message and **no push**
- **And** the student's serialized presence carries `cancelledByStudent: true` and a `cancelledAt` instant
- **And** the coach's class detail shows "cancelled by the student" with that time on the student's row, on web and iOS; the student's own view shows it under "not attending"

#### A late cancellation still pushes the coach (PAD-288)
- **Given** the same student and a class two hours out
- **When** they cancel
- **Then** the coach gets one chat message marked late and exactly one push

#### A coach-marked justified absence is not "cancelled by the student" (PAD-288)
- **Given** the coach validated the sheet marking a student absent and justified
- **When** the presence is serialized
- **Then** `cancelledByStudent` is false and `cancelledAt` is null
