---
id: notifications.toggle-class
status: implemented
depends_on: [notifications.config, classes.instances]
serves: [P-NOTIFICATIONS-3]
governed_by: []
---

# notifications.toggle-class


### Intent
Toggle notification engine on/off for a specific class.

### Rules
1. `POST /api/app/notify/toggle_class` with class reference
2. Updates `notifications_enabled` on the Lesson or LessonInstance
4. **Owner only (PAD-258).** The caller must own the Lesson/LessonInstance (`coach_owns_lesson` /
   `coach_owns_instance`, PAD-92) — 403 otherwise, flag untouched.
3. When disabled, no automatic reminders or auto-invitations fire for that class. **Automatic
   reminders are off; manual sends follow 3b (PAD-736, B-620; owner, 2026-10-22: "off means off").**
   A scheduled `send_class_reminders` pass (the scheduler's jobs, and the past-due "send now",
   `notifications.config` rule 10f) sends nothing for an occurrence whose `notifications_enabled` is
   off and reports nothing more due, so no follow-up is armed. The past-due listing does not offer
   such a class, materialised or not (the lesson's own switch is read for a class with no occurrence
   row yet). The coach's own "Enviar lembretes" (`POST /api/app/notify/send_reminders`) is an
   explicit send, like a manual invitation, and still goes out. Before PAD-736 the pass never read
   the switch, and an off class still asked its students automatically.
3b. **A manual invitation always goes out (PAD-732, B-618; owner, 2026-10-22).** `notifications_enabled`
   governs only the engine's automatic sends. A coach's manual invitation
   (`send_manual_notifications`, `POST /api/app/notify/manual`) on a class with notifications off
   is sent and recorded like on any other class: a `manual` NotificationEvent with its chat
   message, counted in the route's `sent`. Before PAD-732 it returned nothing and the route
   answered `sent: 0` with 200, so the coach believed the student was invited.
3a. **The lesson's value reaches every occurrence it materialises (PAD-729, B-617; numbering
   unconfirmed).** A one-off class or a series created with notifications off has no occurrence row
   until something materialises it (a join request, a cancellation, a side set): the new
   LessonInstance carries the lesson's `notifications_enabled`, never the column default. Before
   PAD-729 the form layer dropped the `False` and the engine invited for a class the coach had
   switched off. (`auto_invites` and `open_spots_visible` are not copied: they resolve instance →
   lesson → type/coach at read time, so a new occurrence inherits them by construction.)
3c. **A series save reaches the occurrences already materialised (PAD-793, B-709; numbering
   unconfirmed).** The class editor's switch is `edit_class`'s `notificationsEnabled`, scoped like
   every edit (`classes.edit` rule 3). `single` sets this occurrence. `future` sets the series (the
   forked one when the edit starts mid-series) **and** every occurrence already materialised from
   the boundary on that the series walk reaches (`classes.edit` rule 9: not ended, not canceled),
   the current one first; occurrences before the boundary keep their value. The
   occurrence's flag is NOT NULL and the engine reads it alone, so it never inherits from the
   series: before PAD-793 a `future` save wrote the series only, answered success, and the
   occurrence on screen kept its old value. Absent from `updates` = untouched.
5. **Automatic invitations are a separate per-class tri-state, `auto_invites` (PAD-429, owner,
   2026-09-24).** It lives on `Lesson` and `LessonInstance` (`NULL` = inherit, `true`/`false` =
   override). `effective_auto_invites()` resolves it instance → lesson → the lesson's `type`:
   `private` → off, `academy` → on. The source is `instance`, `lesson` or `type`. There is no
   coach tier; the coach's engine-wide switch is `notifications.config`'s `auto_notify_enabled`.
   The type default is read-time resolution, never written, so private lessons that already
   exist get it and explicit overrides are kept (coordinator, 2026-09-25, option a).
6. **Only the automatic engine reads it.** With `effective_auto_invites` off:
   - `trigger_invitations` creates no vacancy and sends nothing (semi-automatic approval prompts
     included);
   - the periodic sweep (`process_invitation_batches`) holds every open vacancy of that class and
     sends no batch, so a coach who turns it off mid-fill stops the rounds;
   - a decline does not invite the next student (`_send_next_on_decline`), so no path advances
     a round on its own;
   - the waiting list's group-0 invitations stop too (PAD-446): they are automatic invitations,
     sent by the same gated batch. Offers to students who asked (their own waiting-list place) are
     not automatic invitations and still go out;
   - reminders, `send_manual_notifications` and waiting-list offers are untouched, as is
     `notifications_enabled` (rules 1–3).
   Turning it back on lets the next tick invite for the class's open vacancies.
7. **Wire contract.** The class payload carries `autoInvites` (own tier, tri-state),
   `effectiveAutoInvites` and `autoInvitesSource`. `add_class` / `edit_class` take
   `autoInvites` (absent = untouched, `null` = inherit, boolean = override), scoped per occurrence
   or per series like `openSpotsVisible`. The three fields are new, so builds that predate them
   ignore them and need no capability gate. Web and iOS show the setting on the class detail:
   inherit / on / off, with the source.

### Acceptance Criteria

#### NOTIFICATIONS-TOGGLE-CLASS-1: A private class is not filled automatically (PAD-429)
- **Given** coach Ana's engine is on (fully automatic), and a private lesson with 2 players and `max_players` 3, with no `autoInvites` override
- **When** a student drops out and `trigger_invitations` runs, and the sweep runs
- **Then** no vacancy invitation is sent for the class
- **And** the class reports `effectiveAutoInvites` `false` with `autoInvitesSource` `type`
- **And** its enrolled students still get their reminder

#### NOTIFICATIONS-TOGGLE-CLASS-2: A coach turns automatic invitations on for a private class (PAD-429)
- **Given** the private lesson above with `autoInvites` set to `true` on the lesson
- **When** a student drops out and `trigger_invitations` runs
- **Then** invitations are sent for the open spot

#### NOTIFICATIONS-TOGGLE-CLASS-3: An academy class is filled automatically by default (PAD-429)
- **Given** an academy lesson with no `autoInvites` override
- **When** a student drops out and `trigger_invitations` runs
- **Then** invitations are sent, and the class reports `effectiveAutoInvites` `true` with source `type`

#### NOTIFICATIONS-TOGGLE-CLASS-4: Turning automatic invitations off mid-fill stops the rounds (PAD-429)
- **Given** an academy class with an open vacancy whose first batch has gone out
- **When** the coach sets `autoInvites` `false` on that date and the sweep runs past `maxInactiveTime`
- **Then** no further batch is sent for the vacancy

#### NOTIFICATIONS-TOGGLE-CLASS-5: A decline doesn't invite the next student when automatic invitations are off (PAD-429)
- **Given** an academy class with one invitation out (`maxSimultaneous` 1) and a second eligible student, and `autoInvites` then set to `false` on that date
- **When** the invited student declines
- **Then** no invitation is sent to the second student
- **And** with `autoInvites` on, the same decline invites the second student at once

#### NOTIFICATIONS-TOGGLE-CLASS-6: Manual invitations ignore the setting (PAD-429)
- **Given** a private class with `effectiveAutoInvites` `false`
- **When** the coach sends a manual invitation to a student
- **Then** the invitation is sent

#### NOTIFICATIONS-TOGGLE-CLASS-7: A manual invitation on a class with notifications off is sent (PAD-732)
- **Given** an academy class with `notifications_enabled` off and a student on the coach's roster who is not enrolled
- **When** the coach sends that student a manual invitation
- **Then** the invitation is sent: one `manual` NotificationEvent, live, with its chat message
- **And** `trigger_invitations` on the same class still sends nothing

#### NOTIFICATIONS-TOGGLE-CLASS-8: A class with notifications off sends no automatic reminder (PAD-736)
- **Given** an academy class with an enrolled student who has not been reminded, and `notifications_enabled` off on the occurrence
- **When** a scheduled reminder pass runs
- **Then** nothing is sent, no reminder attempt is recorded, and the pass reports nothing more due
- **And** the same class with notifications on reminds its student
- **And** the coach's own "Enviar lembretes" on the off class reminds the student
- **And** a manual invitation on the off class is still sent (rule 3b)
- **And** a past-due listing does not offer the off class, nor an off lesson that has no occurrence row yet

#### NOTIFICATIONS-TOGGLE-CLASS-9: A "this and following" save of the switch reaches the occurrences already materialised (PAD-793)
- **Given** a weekly series with notifications off and its first three occurrences materialised, all off
- **When** the coach switches notifications on with scope `future` from the second occurrence (on the occurrence or on the lesson)
- **Then** the series from that date is on, and the second and third occurrences are on
- **And** the first occurrence stays off
- **And** the same save from the first occurrence turns all three on, and switching off works the same way
- **And** an edit that does not send `notificationsEnabled` leaves every occurrence as it was

#### NOTIFICATIONS-TOGGLE-CLASS-10: An occurrence's own choice wins, and the simulation says when automatic invitations are off (rules 5, 6)
- **Given** a class with automatic invitations on, and one occurrence of it with them off
- **When** a spot opens on that occurrence
- **Then** nobody is invited, and the class reads `autoInvites` false with `autoInvitesSource` `instance`
- **And** for a client that declares `class-type-defaults`, the simulation reports the gate `class_auto_invites_off`; an older client is told the class's notifications are off instead
test: `backend/padel_app/tests/test_pad429_private_class_defaults.py` › `test_an_instance_override_wins_over_the_lesson` (+1 more)

#### NOTIFICATIONS-TOGGLE-CLASS-11: The class forms store the automatic-invitations choice only when the coach makes one (rule 7)
- **Given** a class created with no `autoInvites`
- **Then** it stores none and follows its type's default
- **When** the coach sets it on, edits the name, then sets it back to "inherit"
- **Then** the stored value is true, stays true through the name edit, and is cleared, with `autoInvitesSource` `type` again
- **And** the class detail shows the three choices, inherit, on and off, with where the current value comes from, and sends null, true or false
test: `backend/padel_app/tests/test_pad429_private_class_defaults.py` › `test_edit_single_sets_auto_invites_and_null_returns_it_to_the_type_default` (+6 more)

#### NOTIFICATIONS-TOGGLE-CLASS-12: A class created with notifications off keeps them off when an occurrence is materialised later (rule 3a, PAD-729)
- **Given** a class created with notifications off, as a one-off or as a weekly series, never materialised
- **When** a student's request materialises an occurrence and a spot opens
- **Then** the occurrence has notifications off and nobody is invited
- **And** the same class created with notifications on invites
test: `backend/padel_app/tests/test_notifications_off_survives_materialisation.py` › `test_a_class_created_with_notifications_off_invites_nobody_once_materialised`

#### NOTIFICATIONS-TOGGLE-CLASS-13: Only the class's own coach switches its notifications (rule 4)
- **Given** coach Ana's class with notifications on, and coach Bruno
- **When** Bruno posts the switch for it
- **Then** the answer is 403 and the class is unchanged
- **And** Ana's own post answers 200 with the new state
test: `backend/padel_app/tests/test_pad258_write_ownership.py` › `test_other_coach_cannot_toggle_class_notifications` (+1 more)

### Notes
- Settled (PAD-736): the OPEN question from PAD-429, whether rule 3's "no reminders" or the code
  that ignored it was right, went to the owner: the rule stands and the code now reads the switch.
- Secondary outcome: this switch is read by both the reminder scheduler and the invitation engine —
  see `notifications.student-gets-class-reminders` and
  `notifications.coach-fills-vacancies-automatically`.
