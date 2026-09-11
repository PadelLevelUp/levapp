---
id: attendance.presence
status: implemented
depends_on: [classes.instances, players.create]
implements: ../../specs-business/attendance/player-confirms-and-manages-attendance.business.md
governed_by: []
---

# attendance.presence


### Intent
Track player attendance for each class instance, including invitation, confirmation, and validation status.

### Entities
- **Presence** (`presences`): lesson_instance_id, player_id, status (present|absent|null), justification (justified|unjustified|null), invited (bool), confirmed (bool), validated (bool), enrolment_source (roster|coach|fill|walk_in|import|unknown, PAD-259), response / responded_at / recorded_by (PAD-271 rule 7, held) — unique on (player_id, lesson_instance_id), indexed on lesson_instance_id (the unique pair leads with player_id, so it cannot serve a per-class lookup)
- Unique constraint: (player_id, lesson_instance_id)

### Rules
1. Presences are auto-created when an instance is materialized (invited=True, confirmed=False)
1a. **(PAD-199, B-017) `invited` is roster membership, not messaging state.** Because rule 1 sets
   it for every enrolled player before any notification exists, nothing user-facing may read
   `invited` as "a reminder/invitation was sent". The messaging signal is derived from the
   notification layer's own records and served on every presence as `reminderSentAt` (ISO
   timestamp or `null`): the newest `notification_reminder` message to the player for that
   instance (`notifications.reminders` rule 7), or the message behind a `NotificationEvent`
   for that (player, instance) (`notifications.invitations`) — whichever is later. It is
   derived on read, never stored, so it cannot drift from what was actually sent.
2. Players confirm attendance via reminders (confirmed=True)
3. Coach marks final attendance: status=present or status=absent
4. Absent players can be marked justified or unjustified
5. `validated=True` means the coach has finalized the attendance record
6. **The row is the enrolment (PAD-259, unconfirmed number).** A presence exists for exactly the players who hold a spot on the occurrence; there is no separate per-occurrence enrolment record. Planned (row exists), intends to come (the student's answer) and was there (the coach's record) are three separate facts on it — see `classes.instance-enrollment` rules 1–2
7. **One response field (PAD-271, audit M5; number self-assigned, unconfirmed; column and migration unblocked 2026-09-11 (coordinator, owner informed); the migration itself is held until batch 5 lands, as every migration is).** The student's answer is one field, `response` (`none` default | `confirmed` | `declined` | `cancelled` | `proactive_decline`), with `responded_at` (UTC) and `recorded_by` (`student` | `coach` | `system` | `import`), written only by the student's own actions (reminder yes/no, cancel, proactive decline) and the import. The coach's record stays `status` / `justification` / `validated` and never moves `response`. `invited` and `confirmed` become derived on read (`invited` always true, `confirmed` = `response != none`) until both shells read `response`, then drop. `late_cancellation` is DERIVED on read (decision 2026-09-11): `response = cancelled` with `responded_at` at or after the cancellation deadline (`attendance.confirm` rule 6); the payload keeps `lateCancellation`; the column is dropped after the backfill. The never-written status values `NotificationEvent.queued`, `Lesson.ended` and `LessonInstance.rescheduled` are dropped in the same migration, guarded. Backfill from the flags: `status=absent AND validated=false` → `declined` (`cancelled` where `late_cancellation`), `confirmed AND status IS DISTINCT FROM absent` → `confirmed`, else `none`; `responded_at` from the latest reminder attempt where one exists. Stored as a CHECK-constrained string like `enrolment_source`

### Acceptance Criteria

#### Auto-create presences
- **Given** a class with players Alice and Bob
- **When** the instance for April 20 is materialized
- **Then** two Presence records are created with invited=True, confirmed=False, status=null

#### The attendance badge reflects a message that exists (PAD-199)
- **Given** an instance materialised with two enrolled players, so both hold a
  `Presence(invited=True, confirmed=False)`, and a reminder sent to only the first
- **When** the coach reads the class detail (`POST /class_instance`, `GET /lesson_instance/<id>`
  or `GET /lesson_instance/<id>/presences`)
- **Then** the first presence carries `reminderSentAt` equal to the reminder's `sent_at` and the
  second carries `reminderSentAt: null`
- **And** on web `AttendanceRow` and on iOS `ParticipantRow` only the first row shows the
  "Reminder sent" badge; a confirmed row shows "Confirmed attendance" either way

- **Given** a player who was invited to fill a vacancy (a `NotificationEvent` with a message)
- **When** the coach reads the class detail
- **Then** that presence's `reminderSentAt` is the invite message's `sent_at`

#### Mark attendance
- **Given** an instance with 4 presences
- **When** coach POSTs to `/api/app/lesson_instance/{id}/confirm_presences` with status for each player
- **Then** each presence.status is updated (present or absent)
- **And** absent players have justification set
