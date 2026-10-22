---
id: notifications.toggle-class
status: implemented
depends_on: [notifications.config, classes.instances]
implements: ../../specs-business/notifications/coach-tunes-the-invitation-engine.business.md
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

#### A private class is not filled automatically (PAD-429)
- **Given** coach Ana's engine is on (fully automatic), and a private lesson with 2 players and `max_players` 3, with no `autoInvites` override
- **When** a student drops out and `trigger_invitations` runs, and the sweep runs
- **Then** no vacancy invitation is sent for the class
- **And** the class reports `effectiveAutoInvites` `false` with `autoInvitesSource` `type`
- **And** its enrolled students still get their reminder

#### A coach turns automatic invitations on for a private class (PAD-429)
- **Given** the private lesson above with `autoInvites` set to `true` on the lesson
- **When** a student drops out and `trigger_invitations` runs
- **Then** invitations are sent for the open spot

#### An academy class is filled automatically by default (PAD-429)
- **Given** an academy lesson with no `autoInvites` override
- **When** a student drops out and `trigger_invitations` runs
- **Then** invitations are sent, and the class reports `effectiveAutoInvites` `true` with source `type`

#### Turning automatic invitations off mid-fill stops the rounds (PAD-429)
- **Given** an academy class with an open vacancy whose first batch has gone out
- **When** the coach sets `autoInvites` `false` on that date and the sweep runs past `maxInactiveTime`
- **Then** no further batch is sent for the vacancy

#### A decline doesn't invite the next student when automatic invitations are off (PAD-429)
- **Given** an academy class with one invitation out (`maxSimultaneous` 1) and a second eligible student, and `autoInvites` then set to `false` on that date
- **When** the invited student declines
- **Then** no invitation is sent to the second student
- **And** with `autoInvites` on, the same decline invites the second student at once

#### Manual invitations ignore the setting (PAD-429)
- **Given** a private class with `effectiveAutoInvites` `false`
- **When** the coach sends a manual invitation to a student
- **Then** the invitation is sent

#### A manual invitation on a class with notifications off is sent (PAD-732)
- **Given** an academy class with `notifications_enabled` off and a student on the coach's roster who is not enrolled
- **When** the coach sends that student a manual invitation
- **Then** the invitation is sent: one `manual` NotificationEvent, live, with its chat message
- **And** `trigger_invitations` on the same class still sends nothing

#### A class with notifications off sends no automatic reminder (PAD-736)
- **Given** an academy class with an enrolled student who has not been reminded, and `notifications_enabled` off on the occurrence
- **When** a scheduled reminder pass runs
- **Then** nothing is sent, no reminder attempt is recorded, and the pass reports nothing more due
- **And** the same class with notifications on reminds its student
- **And** the coach's own "Enviar lembretes" on the off class reminds the student
- **And** a manual invitation on the off class is still sent (rule 3b)
- **And** a past-due listing does not offer the off class, nor an off lesson that has no occurrence row yet

### Notes
- Settled (PAD-736): the OPEN question from PAD-429, whether rule 3's "no reminders" or the code
  that ignored it was right, went to the owner: the rule stands and the code now reads the switch.
- Secondary outcome: this switch is read by both the reminder scheduler and the invitation engine —
  see `notifications.student-gets-class-reminders` and
  `notifications.coach-fills-vacancies-automatically`.
