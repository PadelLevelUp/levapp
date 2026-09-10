---
id: notifications.reminders
status: implemented
depends_on: [notifications.config, classes.instances, attendance.presence]
implements: ../../specs-business/notifications/student-gets-class-reminders.business.md
governed_by: []
---

# notifications.reminders


### Intent
Automatically send class reminders to enrolled players at a configured time before the class.

### Rules
1. Scheduler creates a DateTrigger job per lesson occurrence: `reminder_lesson_{lesson_id}_{date}`
2. At trigger time: materializes instance (if not exists), calls `send_class_reminders()`
3. Reminders sent to all presences for the instance
4. Players respond: confirm (yes) or decline (no) via `respond_to_reminder()`
5. Confirmation updates Presence.confirmed
6. Decline may trigger a vacancy for the invitation engine; in semi-automatic mode, the vacancy awaits coach approval before any invitations are sent (see notifications.semi-auto-approval)
7. Reminders sent via in-app messaging (system message in conversation)
8. Push notification also sent
9. Only the latest reminder for a given (player, instance) is actionable (PAD-49). When a newer reminder is sent for the same (player, instance), every prior reminder message for that pair that the player has NOT yet actioned is marked **superseded** (`msg_metadata.superseded = true`). A superseded reminder renders its action area as a disabled "expired" indicator instead of live Yes/No buttons; responding to it is a no-op. Reminders the player already actioned (confirmed/declined) keep their existing status badge and are never marked superseded. Superseding is idempotent and is delivered to live clients via a `message_edited` event so the buttons update without a reload.
10. A reminder is **expired** once its class has started, or the instance is canceled/completed (PAD-68). The class is closed: nothing about its roster can still usefully change.
    - `respond_to_reminder()` on an expired reminder is a no-op returning `{"action": "expired"}`. It does NOT update Presence (the coach's attendance record for a class that happened is authoritative), does NOT create a Vacancy, and does NOT trigger replacement invitations.
    - The un-actioned reminder messages for that (player, instance) are marked `superseded = true` + `expired = true` and pushed to live clients via `message_edited`.
    - Clients also derive expiry from `msg_metadata.startsAt`, so reminders already sitting in message history stop offering Yes/No the moment their class passes, with no data backfill.
    - The invitation engine enforces the same rule independently: `trigger_invitations()` and the `_send_invitation_batch()` send chokepoint refuse to act for a class that has started, and expire any still-open Vacancy instead. This backstops every fan-out path (scheduler jobs, batch processor, round advance, decline-driven next-invite, and late responses to stale invite messages).
11. A player's answer is always durably recorded (PAD-69). If no Presence row exists for the (player, instance) when they respond, one is created — otherwise the answer is dropped and the next reminder pass treats them as never having replied.
12. Responding is **idempotent** (PAD-94). Re-submitting the answer already on record for a (player, instance) is a no-op that returns the recorded action plus `"duplicate": True`. It sends no second `reminder_confirmed`/`reminder_declined` system message, creates no extra Vacancy, and does not re-drive the invitation engine — so N rapid taps on **No** produce exactly ONE decline message and ONE round of replacement invitations, not N.
    - "Already on record" means the Presence row still reflects that same answer **and** no un-actioned reminder message is pending for that (player, instance). A newer reminder (rule 9) is a fresh question and is always answerable, even with the same answer.
    - Changing the answer (`yes` → `no`, or `no` → `yes`) is never suppressed.
    - The invitation engine enforces the same guarantee independently: the decline path does not re-trigger invitations when the player's spot already has an open Vacancy with live (`sent`/`queued`/`confirmed`) invitations out for it.
13. **Answering is reading (PAD-202).** A reminder can be answered from outside the chat — the
    student dashboard offers Yes/No on the class row (`dashboard.blocks` rule 3a). When
    `respond_to_reminder()` (or `respond_to_notification()` for an invite) records a **fresh**
    answer, it advances the player's `ConversationParticipant.last_read_at` in that conversation
    to the moment of the answer — never backwards. The reminder, everything before it, and the
    `reminder_confirmed` / `reminder_declined` acknowledgement the answer itself produces (the
    echo of the player's own action, not news) stop counting as unread; anything sent after the
    answer still does. A duplicate answer (rule 12) or an expired reminder (rule 10) does not
    touch the marker. (The read state is one watermark per conversation, so "read up to the
    answer" is the finest grain the model allows.)

15. **The scheduler never starts in a CLI or migration process (PAD-264, audit H12).**
    `init_scheduler` returns without starting APScheduler when the process is a migration
    (`config.is_migration_invocation`: any `db` sub-command) or any Flask CLI command other than
    `run`. That holds whether the process was launched as the `flask` console script or as
    `python -m flask`, which is how the production entrypoint (`backend/scripts/entrypoint.sh`)
    runs `db upgrade`. Server processes (gunicorn, `flask run`, including `flask --app app.py
    run`) start it as before. Before this, `python -m flask … db upgrade` put `sys.argv[0]` at
    `flask/__main__.py`, the guard missed it, and every deploy's migration started the
    scheduler: jobs could fire against a half-migrated schema and the startup reschedule ran
    twice.
    *(Numbered 15, not 14: PAD-258 (#155) appends a rule 14 to this file on its own branch.)*

### Acceptance Criteria

#### Reminder job fires
- **Given** a recurring lesson on Mondays at 10:00 with reminder timing "24 hours before"
- **When** the scheduler fires at Sunday 10:00
- **Then** the Monday instance is materialized (if needed)
- **And** reminder messages are sent to all enrolled players

#### Player confirms reminder
- **Given** player received a reminder for instance 10
- **When** they respond with action `yes`
- **Then** their Presence.confirmed = True

#### Player declines reminder
- **Given** player received a reminder for instance 10
- **When** they respond with action `no`
- **Then** their presence is updated
- **And** a Vacancy is created (if auto_notify_enabled)
- **And** if `invitation_mode` is `semi_automatic`, the vacancy is created with approval_status "pending" and no invitations are sent until the coach approves

#### Late response to a reminder for a class that already happened (PAD-68)
- **Given** a player who received a reminder for instance 10 and never answered it
- **And** instance 10's start time has now passed
- **When** they respond with action `no`
- **Then** the call returns `{"action": "expired"}`
- **And** no Vacancy is created and no replacement invitations are sent to any other player
- **And** their Presence attendance record is left untouched
- **And** the stale reminder message is marked `superseded = true` / `expired = true` so its Yes/No buttons are replaced by the "reminder expired" indicator

#### Invitation engine ignores classes that already started (PAD-68)
- **Given** an open Vacancy on an instance whose start time has passed
- **When** the invitation engine is asked to send a batch for it (by any caller)
- **Then** no invitation is sent and the Vacancy is marked `expired`

#### Response is always recorded (PAD-69)
- **Given** a player responding to a reminder for a future class with no Presence row for that (player, instance)
- **When** they respond with action `no`
- **Then** a Presence row is created recording the response
- **And** the follow-up reminder is not sent on the next reminder pass

#### Repeated identical responses are idempotent (PAD-94)
- **Given** a player who received a reminder for instance 10 and has already responded `no`
- **When** they respond with action `no` twice more (impatient re-tapping)
- **Then** the 2nd and 3rd calls return `{"action": "declined", "duplicate": True}`
- **And** exactly ONE `reminder_declined` system message exists for that (player, instance)
- **And** exactly ONE Vacancy exists for their spot
- **And** exactly ONE round of replacement invitations was fanned out (no candidate is invited twice)
- **And** the same holds for repeated `yes` (one `reminder_confirmed` message)
- **And** answering `yes` after `no` (a genuine change) is still processed normally

#### Answering from the dashboard marks the reminder read (PAD-202)
- **Given** a player whose direct conversation with the coach holds an unread reminder for
  instance 10 and an unread coach message sent after it
- **When** they respond `yes` through `respond_to_reminder()`
- **Then** nothing in that conversation counts as unread any more (the reminder, the coach
  message and the `reminder_confirmed` acknowledgement are all before the answer), and a coach
  message sent **after** the answer counts as unread again

#### Newer reminder supersedes older reminder buttons (PAD-49)
- **Given** a player who received a first reminder (with live Yes/No buttons) for instance 10 and has not yet responded
- **When** a second reminder for instance 10 is sent to the same player
- **Then** the first reminder message is marked superseded (`msg_metadata.superseded = true`) and its action area renders as a disabled "expired" indicator (no live Yes/No buttons)
- **And** only the second (latest) reminder shows actionable Yes/No buttons
- **And** if the player had already confirmed/declined the first reminder, it keeps its status badge and is NOT marked superseded

#### The scheduler does not start inside a migration (PAD-264)
- **Given** the production entrypoint running `python -m flask --app app.py db upgrade`
- **When** the app factory runs
- **Then** APScheduler is not started and no reminder job is rescheduled
- **And** gunicorn and `flask run` (including `flask --app app.py run`) still start it
