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
3. When disabled, no reminders or auto-invitations fire for that class
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

#### Manual invitations ignore the setting (PAD-429)
- **Given** a private class with `effectiveAutoInvites` `false`
- **When** the coach sends a manual invitation to a student
- **Then** the invitation is sent

### Notes
- OPEN (found in PAD-429, not changed here): rule 3 says a class with notifications off gets no
  reminders, but the reminder path (`send_class_reminders`) never reads `notifications_enabled`.
  Either the rule or the code is wrong; it needs its own ticket.
- Secondary outcome: this switch is read by both the reminder scheduler and the invitation engine —
  see `notifications.student-gets-class-reminders` and
  `notifications.coach-fills-vacancies-automatically`.
