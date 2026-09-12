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
- **Presence** (`presences`): lesson_instance_id, player_id, status (present|absent|null), justification (justified|unjustified|null), invited (bool), confirmed (bool), validated (bool), enrolment_source (roster|coach|fill|walk_in|import|unknown, PAD-259), response / responded_at / recorded_by (PAD-271 rule 7, held) — unique on (player_id, lesson_instance_id), indexed on lesson_instance_id (the unique pair leads with player_id, so it cannot serve a per-class lookup) Serialized rows also carry `cancelledByStudent` and `cancelledAt` (derived, PAD-288 — `attendance.confirm` rule 23).
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
7. **One response field (PAD-271, audit M5; number self-assigned, unconfirmed; column and migration unblocked 2026-09-11 (coordinator, owner informed); the migration (`7558c350c002`) goes in batch 7, after a dry run on a fresh production-shaped dump).** The student's answer is one field, `response` (`none` default | `confirmed` | `declined` | `cancelled` | `proactive_decline`), with `responded_at` (UTC) and `recorded_by` (`student` | `coach` | `system` | `import`), written only by the student's own actions (reminder yes/no, cancel, proactive decline) and the import. The coach's record stays `status` / `justification` / `validated` and never moves `response`. `invited` and `confirmed` become derived on read (`invited` always true, `confirmed` = `response != none`) until both shells read `response`, then drop. `late_cancellation` is DERIVED on read (decision 2026-09-11): `response = cancelled` with `responded_at` at or after the cancellation deadline (`attendance.confirm` rule 6); the payload keeps `lateCancellation`; the column is dropped after the backfill. The never-written status values `NotificationEvent.queued`, `Lesson.ended` and `LessonInstance.rescheduled` are dropped in the same migration, guarded. Backfill from the flags: `status=absent AND validated=false` → `declined` (`cancelled` where `late_cancellation`), `confirmed AND status IS DISTINCT FROM absent` → `confirmed`, else `none`; `responded_at` from the latest reminder attempt where one exists. Stored as a CHECK-constrained string like `enrolment_source`
8. **Cancelled by the student is derived, not stored (PAD-288, unconfirmed number).** A serialized presence exposes `cancelledByStudent` = `status = absent` ∧ `justification = justified` ∧ `validated = false`, and `cancelledAt` = the row's `updated_at` as a UTC instant when that holds, else null. The coach validating the sheet (rule 5) ends the label; no column is added.
9. **One field a human can read: `attendanceState` (PAD-313, ledger B-073; rule number self-assigned, unconfirmed — rule 8 is PAD-288's, in flight).** The payload carries one derived string, and exactly one of five values is ever true: `planned` (on the list, has not answered), `coming` (answered yes), `not_coming` (the spot is given up and no coach record exists yet — a decline or a cancellation, early ones included), `attended` (the coach validated them present), `missed` (the coach validated them absent). **While `validated` is false it reports the STUDENT's intent; once `validated` is true it reports the COACH's record and nothing else.** It is computed in exactly one place on the model and served by every surface that shows attendance — the class-detail payload and the Presences/validation rows — so no client renders a state of its own.
   The ordering is the point. A decline writes `confirmed = true` (rule 2's flag means *answered*, not *coming*), so the absent check must come before the confirmed check; testing `confirmed` first reports a student who just cancelled as confirmed, which is the defect B-073 records and what a founder saw on TestFlight 20 as "presença confirmada", "falta justificada" and "ausente" at once.
   **The state says WHAT, never WHO** (ruling of 2026-09-12). `not_coming` means the spot is given up and no coach record exists yet — it is *not* a claim that the student said so, nor that the absence is justified. Justification is a separate column and this value does not read it: an unvalidated absence is `not_coming` whether it is marked justified, unjustified or neither, because `validated` is the only thing that separates the student's intent from the coach's record, and `missed` would assert a record no coach has made. On today's columns provenance cannot be told apart: a coach's own mark stamps `validated`, which is the only reason an unvalidated justified absence is in practice the student's own. Who cancelled is a separate, narrower fact (`cancelledByStudent`, `attendance.confirm` rule 23), surfaced only where it is known, and it must never be folded into this value. Rule 7's `recorded_by` is what makes provenance a stored fact; until it lands, no client may read this field as "the student cancelled". Conflating the two would be the same failure as `confirmed` meaning *answered* — a name promising more than the column knows.
   **A yes must undo what a no wrote (B-073, the same defect reversed).** The columns carry no timestamp, so no reader can tell which answer came last — only the writer can. `respond_to_reminder` "yes" therefore clears `status`, `justification` and `late_cancellation` when the row is not validated, and a "no" sets them. Leaving them was a live production defect, not a display one: the class did not count the returning student (`effective_filled_spots` subtracts absent presences) and their vacancy stayed open for the engine to give away, while the app read `confirmed` and told them they had a seat. Re-taking the spot is a capacity decision, so it is made under the class lock: if the class is full the re-confirmation is **refused** with `spot_filled` (`notifications.invitations` rule 10's one-winner rule — two students cannot hold one place), and both the student **and the coach** are told, the coach because they were told of the cancellation and are the only one who can seat the student by hand. When it succeeds, the returning student's own vacancy is closed and its live invitations retired: capacity alone would not close it, because a half-empty class has spots to spare and the engine would go on offering the seat its owner just re-took.
   **After an Undo** (`attendance.validation`) a coach-written absence reads as `not_coming`, because undo clears `validated` and deliberately keeps what the coach recorded, leaving a row shaped exactly like a student's decline. That is the author-blindness above, not a defect: the state is true of the spot. It is also the clearest case for rule 7's `recorded_by`, which is what will let this read `planned` again.
   Edge, decided 2026-09-12: `validated = true` with no `status` recorded — a coach who validated the sheet without marking that student — falls back to the student's intent, because reporting `missed` would invent an absence the coach never stated.
   The raw columns (`invited`, `confirmed`, `status`, `justification`, `validated`) stay on the payload while the clients move over; they are removed when rule 7's `response` lands and this field derives from it instead.

### Acceptance Criteria

#### One derived state, and only one (PAD-313, B-073)
- **Given** a student on a class's list who has not answered
- **When** the class detail or the Presences row is read
- **Then** `attendanceState` is `planned`

- **Given** that student answers the reminder "yes"
- **Then** `attendanceState` is `coming`

- **Given** that student instead cancels, or declines the reminder, or declines proactively — so the row holds `confirmed=true`, `status=absent`, `justification=justified`, `validated=false`
- **Then** `attendanceState` is `not_coming`, **never** `coming`
- **And** the same row read from the Presences/validation rows reports `not_coming` too

- **Given** the coach then validates the sheet marking that student absent
- **Then** `attendanceState` is `missed` — the coach's record replaces the student's intent

- **Given** a student the coach validates as present
- **Then** `attendanceState` is `attended`

- **Given** a coach who validates a sheet without recording a status for one student
- **Then** that student's `attendanceState` still reports their own intent, never `missed`

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
