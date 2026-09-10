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
6. The coach configures a cancellation deadline `cancellationDeadlineHours` (default 24) on their NotificationConfig (see notifications.config). The deadline is `instance.start_datetime - cancellationDeadlineHours`. A cancellation made at or after this deadline but still before class start is **allowed** (never blocked) but flagged as a **late cancellation** (`Presence.late_cancellation=True`). A cancellation before the deadline sets `late_cancellation=False`. The spot is freed and invitations (re)triggered identically regardless of lateness
7. The `Presence.late_cancellation` boolean column records whether a cancellation was late. Serialized presence payloads expose `lateCancellation`; the serialized class-instance payload exposes the effective `cancellationDeadlineHours` (and/or a deadline timestamp) so the frontend can render deadline-aware UX
8. When a player cancels attendance (`POST /api/app/notify/cancel_attendance`), the **coach is notified** with exactly one message per cancellation. The notification reuses the existing coach↔player direct conversation / system-message infrastructure (no new channel/model): a message is created in that conversation and its push notification is directed at the coach. The message identifies the **student** (name) and the **class instance** (title + start date/time). When the cancellation is late (`late_cancellation=True`), the notification is clearly marked as a late cancellation both in its human-readable text and via a machine-readable `msg_metadata` marker (`lateCancellation: true`, plus `lessonInstanceId`). Reminder declines (`respond_reminder` with `no`) do not emit this coach cancellation notification — it is specific to the `cancel_attendance` path, which is the only path that computes lateness. The single coach notification is in addition to (and does not replace) the existing student-facing acknowledgement message
9. A student can cancel attendance directly from an enrolled class in the calendar class-detail view (not only from a chat reminder). Both surfaces (the class-detail view and the reminder bubble) call the same `POST /api/app/notify/cancel_attendance` and render deadline-aware UX from the class-instance payload's `cancellationDeadline` / `cancellationDeadlineHours`: before the deadline a normal confirm, at/after the deadline a "late cancellation" warning that still allows the cancel. The action is hidden once the class has started; a 409 is handled gracefully with an error message

#### Proactive decline (PAD-73)
10. **Proactive-decline window.** A decline made *before the student would normally have been asked to confirm* is a **proactive decline**. The window closes at the instant the attendance reminder for that instance would fire, i.e. `proactiveDeclineDeadline = _compute_reminder_dt(instance, config.get_reminder_timing())` — the **same** helper and the same `reminder_timing.firstReminder` config the scheduler uses to arm the reminder job (see `notifications.reminders`). The cutoff is therefore always derived, never a hardcoded interval, and it moves when the coach changes their reminder timing. When the timing config yields no computable instant, no proactive window exists and today's plain-cancellation behaviour applies unchanged
11. **Same endpoint, server-side classification.** A proactive decline is not a separate endpoint or a separate code path: it is `POST /api/app/notify/cancel_attendance`, which classifies the decline itself from the server clock. The response carries `{"action": "declined", "proactive": true|false}`. The client never decides which kind of decline occurred — a stale client cannot mislabel one
12. **A proactive decline is never a late cancellation.** When `now < proactiveDeclineDeadline`, `Presence.late_cancellation` is forced `False` regardless of `cancellationDeadlineHours`. This matters only when a coach configures a reminder that fires *after* their own cancellation deadline; telling the coach at the earliest moment the system ever expected an answer is by definition not late
13. **Effects of a proactive decline** (all of which reuse the existing shared decline path, `_free_spot_for_declining_player`):
    - the absence is auto-justified — `status="absent"`, `justification="justified"`, `confirmed=True`, exactly the state a reminder decline writes, so `attendance.stats` and `effective_filled_spots` stay coherent;
    - the vacancy is created **immediately** (`_ensure_vacancy_for_player`), so the spot reads as free the moment the student declines, without waiting for the next batch tick;
    - **invitation timing is unchanged**: invitations are only sent when `now >= invitationStart` (`notifications.invitations`). A decline 10 days out pre-creates the vacancy and sends nothing; the existing `invite_start_{instance_id}` job fans out at the configured hour. Semi-automatic mode still routes through coach approval
    - the coach is notified exactly once, with wording that distinguishes a proactive decline from a plain or late cancellation, and a machine-readable `msg_metadata.proactiveDecline` marker alongside the existing `cancellation` / `lateCancellation` / `lessonInstanceId` keys
14. **Authorization.** `cancel_attendance` is authorized on **enrolment**, not on the presence row: the acting user must resolve to a `Player` who has an `Association_PlayerLessonInstance` for that instance, otherwise 403. A student may only ever decline their own enrolment on a class they are actually in (PAD-88 / PAD-115 precedent)
15. **How the invitation-timing guarantee is enforced.** Declining to call `trigger_invitations` is *not* sufficient to hold invitations back: `process_invitation_batches` sweeps every `status="open"` vacancy every two minutes and fires a batch immediately on any vacancy whose `last_activity_at` is `None`. The only thing it defers to is `Vacancy.invite_not_before`. Therefore a vacancy created by a decline that lands **before** `invitationStart` is stamped with `invite_not_before = invitationStart` (the same field the semi-automatic approval path stamps, and the same field `trigger_invitations` and `_send_invitation_batch` already honour). Without this stamp a decline 10 days out would fan out invitations within two minutes, defeating rule 13. This applies to the whole shared decline path (`_free_spot_for_declining_player`), so a reminder decline outside the invitation window is held back too — which is what `notifications.invitations` already specified
16. **Frontend.** The proactive-decline affordance lives in the class-detail **participants** section, on the student's own row, and is shown only while the proactive window is open (`canDeclineProactively`). The class-instance payload exposes `proactiveDeclineDeadline` (ISO-8601 or null) and `canDeclineProactively` (bool), both computed by the same server helper as rule 10, so the button is never offered when the server would refuse it. Once the window closes the affordance disappears and the existing rule-9 cancel action remains the way to decline (a normal/late cancellation). After declining, the student's own row shows a persistent "not attending / justified absence" state **derived from their serialized presence** (`status==="absent" && justification==="justified"`), so it survives a reload. All copy goes through `src/locales/{pt,en}/calendar.json`; default locale `pt`. **(PAD-170 C5)** The affordance exists on **both** shells — web's `ClassDetailSheet` and iOS's `app/class/[id].tsx` — under the student's own attendance block, with the same three states: the "I can't attend" button plus its hint while the window is open, the persistent "not attending / justified absence" panel once declined, and the plain rule-9 cancel action once the window has closed. iOS reads `canDeclineProactively` from the same payload and never re-derives the reminder instant, so a phone can no more offer the action out of window than the browser can
17. **Owner only (PAD-258, audit H4).** `POST /api/app/class_instance/presences/confirm` resolves
   the target the same way the service does (`originalId` + the calendar-event id prefix /
   `parentClassId`) and requires the calling coach to own it (`require_owned_class`, PAD-92)
   BEFORE anything is materialised or written; 403 otherwise. Every `playerId` in the payload
   must be enrolled in that class or on the caller's roster — an arbitrary id is 403, not an
   upsert.

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

#### Late cancellation is allowed but flagged
- **Given** a player who confirmed attendance for an instance whose start is less than `cancellationDeadlineHours` away but still in the future
- **When** the player cancels via `POST /api/app/notify/cancel_attendance`
- **Then** the cancellation is allowed (not blocked), `presence.late_cancellation=True`, and the freed spot still re-triggers the invitation engine

#### Coach is notified on a (non-late) cancellation
- **Given** a player who confirmed attendance for an instance whose start is more than `cancellationDeadlineHours` away
- **When** the player cancels via `POST /api/app/notify/cancel_attendance`
- **Then** exactly one coach-facing notification is produced in the coach↔player conversation whose push is directed at the coach
- **And** it identifies the student (name) and the class instance (title + start date/time)
- **And** it is NOT marked as a late cancellation (`msg_metadata.lateCancellation` is false)

#### Coach is notified and the late flag is set on a late cancellation
- **Given** a player who confirmed attendance for an instance whose start is less than `cancellationDeadlineHours` away but still in the future
- **When** the player cancels via `POST /api/app/notify/cancel_attendance`
- **Then** exactly one coach-facing notification is produced (no duplicate)
- **And** it is marked as a late cancellation in both its text and `msg_metadata.lateCancellation=true`

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

#### Cancellation deadline config default and round-trip
- **Given** a coach with no explicit deadline set
- **When** they GET `/api/app/notify/config`
- **Then** `cancellationDeadlineHours` is 24
- **And** POSTing a new value persists and is returned on the next GET
