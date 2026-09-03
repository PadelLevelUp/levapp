---
id: notifications.student-block-preferences
status: implemented
depends_on: [notifications.invitations, notifications.manual, notifications.reminders, notifications.waiting-list, settings.profile, settings.role-scope, calendar.student-blockers]
implements: ../../specs-business/notifications/coach-relies-on-notifications.business.md
governed_by: []
---

# notifications.student-block-preferences


### Intent
Give the STUDENT a standing, always-on switch over class-slot solicitations, independent of the
per-time-window availability blockers of `calendar.student-blockers`. A blocker says "not at that
hour"; these preferences say "not at all" — a student who does not want to be pinged about open
spots can say so once, from their own Settings, without having to carve out calendar windows.

Because a silenced student is invisible to the invitation engine, the coach must be able to see
that this is deliberate rather than assume the student is ignoring them. So the student may attach
a free-text reason, and that reason — together with a "notifications cut" signal — is shown to the
coach on the student's record in Players management.

Scope: class-slot solicitations only (automatic invitations, manual invitations, waiting-list
offers and attendance reminders). Direct messages between coach and student, class-cancellation
notices and "you got the spot" confirmations are NOT suppressed — silencing invitations must never
cut a student off from their coach.

### Entities
- **User** (`users`) — extends auth.login's User entity with four standing preference fields:
  - `notif_block_auto_invitations` (boolean, NOT NULL, default `false`) — the automatic
    suggestion/auto-invite engine stops considering this student eligible.
  - `notif_block_manual_invitations` (boolean, NOT NULL, default `false`) — the coach cannot
    manually invite this student to an open spot.
  - `notif_block_all` (boolean, NOT NULL, default `false`) — every class-slot solicitation is
    suppressed, including attendance reminders.
  - `notif_block_reason` (text, nullable) — the student's own free-text explanation, written by
    the student and readable by their coach.

### Rules
1. The three block levels are **independent** and may be set in any combination. `notif_block_all`
   is a superset in effect, not a replacement: switching it on does not switch the other two on,
   and switching it off does not switch them off.
2. The preferences are exposed on the per-user profile surface, which is already open to both
   roles: `GET /api/auth/me` returns `blockAutoInvitations`, `blockManualInvitations`,
   `blockAllNotifications` and `notificationBlockReason`; `PATCH /api/auth/me` accepts any subset
   of them. Fields absent from the payload are left untouched.
3. Partial updates must honour an explicit `false`. Sending `{"blockAllNotifications": false}`
   clears the flag; it is never swallowed as "no value supplied". (Boolean fields are read with an
   `in`-membership check, never a truthiness check — see the PAD-93 boolean regression.)
4. `notificationBlockReason` is trimmed; an empty string clears it to `NULL`. It is free text with
   no required format, and is never required in order to set a toggle.
5. **Automatic block.** When `notif_block_auto_invitations` OR `notif_block_all` is set, the
   auto-invitation eligibility engine (`get_eligible_students` and
   `_get_eligible_students_for_group`) drops the student from the candidate list, at the same
   point where `calendar.student-blockers` rule 5 filters window-blocked candidates. The student
   is therefore never counted in a round, never batched and never gets a `NotificationEvent`.
6. **Manual block.** When `notif_block_manual_invitations` OR `notif_block_all` is set,
   `send_manual_notifications` skips the student **before** the `NotificationEvent` is created, so
   no orphan "sent" event exists for an invitation that was never delivered. Every other selected
   student is still notified. `POST /api/app/notify/manual` reports the skipped students in the
   same `blocked` array used by `calendar.student-blockers` rule 10, each entry carrying an
   optional `reason` (the student's `notif_block_reason`, or empty when they gave none).
7. **Block-all.** When `notif_block_all` is set, the student additionally receives no attendance
   reminders: `send_class_reminders` skips them, still reminds everyone else, and reports them in
   its `blocked` array. A skipped student is never counted in `sent`.
8. **Hard backstop.** `_send_system_message` refuses to deliver any `notification_invite`,
   `notification_reminder` or `waiting_list_offer` to a recipient whose `notif_block_all` is set,
   whatever fired the send. This is the same delivery choke point and the same blockable
   message-type set as `calendar.student-blockers` rule 11, and the two conditions are additive:
   a send is suppressed if EITHER an availability blocker overlaps the class window OR the
   recipient has blocked all notifications. Neither the chat message nor the web/Expo push is
   created. The backstop is a safety net, not the primary enforcement — the earlier filters in
   rules 5–7 are what prevent orphan events and lying counts.
9. Message types outside that set are unaffected: plain chat (`text`), class-cancellation notices
   and `waiting_list_placed` confirmations are still delivered to a student who blocked everything.
10. **Coach visibility.** The coach-facing player payload
    (`_serialize_coach_player_relation`, and the identical dict returned by
    `Player.coach_player_info` used by `add_player`/`edit_player`) carries
    `blockAutoInvitations`, `blockManualInvitations`, `blockAllNotifications`,
    `notificationBlockReason`, and a derived `notificationsBlocked` that is true when any of the
    three flags is set. Both sites must carry the fields, or the signal disappears the moment a
    coach edits the student.
11. The student's record in Players management shows a "notifications cut" signal whenever
    `notificationsBlocked` is true, together with which levels are blocked and the student's
    reason when they gave one. This reason is deliberately coach-visible — the opposite posture to
    `calendar.student-blockers` rule 8, where blocker titles, descriptions and hours are the
    student's private calendar and are never exposed.
12. **Confirmation gate.** Switching `blockAllNotifications` ON requires an explicit confirmation
    dialog carrying the consequence: "Deixará de receber lembretes e qualquer aula que falte será
    considerada injustificada caso não confirme a sua indisponibilidade. Tem a certeza que
    pretende avançar?". The preference is persisted only after the student confirms; cancelling
    leaves the toggle off and writes nothing. Switching it OFF needs no confirmation.
13. The preferences are configured **only** from the student's Settings. No toggle, button or
    shortcut for them appears on the calendar.
14. All four preference fields are per-user and stay open to a student caller — they must not be
    swept up by the coach-only role check of `settings.role-scope` rule 6.

### Acceptance Criteria

#### Defaults are "receives everything"
- **Given** a newly created student who has never touched the preferences
- **When** `GET /api/auth/me` is read
- **Then** `blockAutoInvitations`, `blockManualInvitations` and `blockAllNotifications` are all `false`
- **And** `notificationBlockReason` is empty

#### Student blocks automatic invitations with a reason
- **Given** an authenticated student on Settings → Notifications
- **When** they switch on "block automatic invitations", type a reason and save
- **Then** `PATCH /api/auth/me` succeeds and a success notification is shown
- **And** after reloading the page the toggle is still on and the reason still shown

#### An explicit false is persisted
- **Given** a student whose `blockAllNotifications` is `true`
- **When** they PATCH `/api/auth/me` with `{"blockAllNotifications": false}`
- **Then** the response succeeds and a subsequent read returns `false`

#### The three levels are independent
- **Given** a student with `blockAutoInvitations` = `true`
- **When** they switch `blockManualInvitations` on and then off again
- **Then** `blockAutoInvitations` is still `true`
- **And** switching `blockAllNotifications` on leaves the other two unchanged

#### Blocking everything demands confirmation
- **Given** an authenticated student on Settings → Notifications
- **When** they switch on "block all notifications"
- **Then** a confirmation dialog appears warning that missed classes will count as unjustified
- **And** cancelling leaves the toggle off and sends no request
- **And** confirming persists `blockAllNotifications` = `true`

#### The auto engine stops considering a blocked student
- **Given** a student who would otherwise be eligible for an open spot in a class
- **And** whose `blockAutoInvitations` is `true`
- **When** auto-invitation eligibility is computed for that vacancy
- **Then** the student is not in the candidate list
- **And** no `NotificationEvent` is created for them

#### A manual invitation to a blocked student is skipped, not orphaned
- **Given** a coach manually selecting three students for an open spot, one of whom has
  `blockManualInvitations` = `true` and a reason "estou lesionado"
- **When** the coach sends the manual notifications
- **Then** the other two students receive their invitation messages
- **And** the blocked student receives no message and has no `NotificationEvent`
- **And** the response reports `sent` = 2 and lists the blocked student with their reason

#### Blocking everything also silences reminders
- **Given** an enrolled student whose `blockAllNotifications` is `true` and a class due a reminder
- **When** reminders are sent for that class
- **Then** the student receives no reminder message
- **And** the other enrolled students still receive theirs
- **And** the reported `sent` count excludes the blocked student

#### Blocking everything does not cut the student off from their coach
- **Given** a student whose `blockAllNotifications` is `true`
- **When** their coach sends them a normal chat message, and when a class they are enrolled in is cancelled
- **Then** both messages are delivered

#### The coach sees the signal and the reason
- **Given** a student with `blockAutoInvitations` = `true` and reason "vou estar fora até setembro"
- **When** their coach opens that student's record in Players management
- **Then** a "notifications cut" signal is shown on the record
- **And** the student's reason "vou estar fora até setembro" is readable by the coach

#### The signal survives a coach edit
- **Given** a coach viewing a student whose notifications are blocked
- **When** the coach edits that student and saves
- **Then** the returned player payload still carries the block flags and reason
- **And** the signal is still shown

#### No calendar control
- **Given** a student on the calendar
- **When** they inspect the calendar UI
- **Then** no toggle, button or shortcut for these notification preferences is offered there

### Notes
- Source: ticket PAD-112 (reported by `tomasmpacheco` via Discord).
- Distinct from `calendar.student-blockers` (PAD-28/PAD-107): those are time-window blockers
  evaluated against the class instance window; these are standing per-user preferences evaluated
  regardless of when the class is. The two compose additively at every enforcement point.
- The reason field's coach-visibility is a deliberate product decision from the ticket Q&A, and is
  the opposite of the privacy posture of availability blockers. The two must not share a code path.
- Out of scope, and pre-existing: the waiting-list auto-enrolment path (`_fill_from_waiting_list`)
  adds a student to a class outright without soliciting them, so it is an enrolment decision, not
  a notification. It is not gated by these preferences (nor by `calendar.student-blockers`). The
  `waiting_list_offer` message, which IS a solicitation, is gated.
- Direct messages / DMs are explicitly out of the initial scope per the ticket Q&A.
