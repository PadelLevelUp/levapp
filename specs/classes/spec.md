# classes — Lessons & Instances

## classes.create

---
id: classes.create
status: implemented
depends_on: [clubs.crud, levels.coach-levels]
---

### Intent
Coaches create classes (lessons) that can be one-off or recurring. Classes are the template; instances are the actual scheduled occurrences.

### Entities
- **Lesson** (`lessons`): title, description, start_datetime, end_datetime, is_recurring, recurrence_rule (JSON RRULE), recurrence_end, type (academy|private), default_level_id, max_players, color, status (active|ended), notifications_enabled, club_id
- **Association_CoachLesson** (`coach_in_lesson`): coach_id, lesson_id
- **Association_PlayerLesson** (`player_in_lesson`): player_id, lesson_id

### Rules
1. Type is `academy` (group) or `private` (1-on-1)
2. Recurrence stored as JSON in `recurrence_rule` field (not iCal RRULE string)
3. `recurrence_end` sets when recurring series stops
4. `max_players` caps enrollment
5. Coach and enrolled players are linked via junction tables
6. Creating a lesson with `notifications_enabled=true` schedules reminder jobs

### Acceptance Criteria

#### Create one-off class
- **Given** an authenticated coach in club 1
- **When** they POST to `/api/app/class` with `{"title": "Monday Beginners", "start_datetime": "2026-04-13T10:00", "end_datetime": "2026-04-13T11:00", "type": "academy", "max_players": 6}`
- **Then** a Lesson record is created with `is_recurring=false`
- **And** a `coach_in_lesson` association is created

#### Create recurring class
- **Given** an authenticated coach
- **When** they POST with `is_recurring=true` and `recurrence_rule={"frequency": "weekly", "daysOfWeek": [1]}`
- **Then** a Lesson record is created with the recurrence config
- **And** reminder jobs are scheduled for the next 60 days of occurrences

---

## classes.edit

---
id: classes.edit
status: implemented
depends_on: [classes.create]
---

### Intent
Edit a class or a specific instance. Supports editing single occurrences or all future occurrences of a recurring class.

### Rules
1. `PATCH /api/app/class/{lesson_id}` edits the parent lesson template
2. `PATCH /api/app/lesson_instance/{instance_id}` edits a specific instance
3. Scope parameter: `single` (just this occurrence) or `future` (this and all future)
4. Instance edits create overridden fields tracked in `overridden_fields` JSON
5. Changing lesson time reschedules all future reminder/invitation jobs

### Acceptance Criteria

#### Edit single instance
- **Given** a recurring class with an instance on April 20
- **When** coach PATCHes the instance with `{"overwrite_title": "Special Session"}`
- **Then** only the April 20 instance shows "Special Session"
- **And** `overridden_fields` tracks which fields differ from the parent

#### Edit future occurrences
- **Given** a recurring class starting at 10:00
- **When** coach edits with scope `future` to start at 11:00
- **Then** the parent lesson template is updated
- **And** all future instances reflect the new time

---

## classes.delete

---
id: classes.delete
status: implemented
depends_on: [classes.create]
---

### Intent
Delete a class or specific occurrence. Supports deleting single or future occurrences.

### Rules
1. `DELETE /api/app/class/{lesson_id}` deletes the lesson and all instances (CASCADE)
2. `DELETE /api/app/lesson_instance/{instance_id}` deletes a single instance
3. Scope: `single` (cancel one occurrence) or `future` (end series)
4. Deleting cancels associated scheduler jobs

### Acceptance Criteria

#### Delete single occurrence
- **Given** a recurring class with instances on April 13, 20, 27
- **When** coach deletes the April 20 instance with scope `single`
- **Then** only the April 20 instance is removed
- **And** April 13 and 27 remain

---

## classes.instances

---
id: classes.instances
status: implemented
depends_on: [classes.create]
---

### Intent
Lesson instances are the actual scheduled occurrences of a class. For recurring lessons, instances are materialized lazily (on-demand).

### Entities
- **LessonInstance** (`lesson_instances`): lesson_id, original_lesson_occurence_date, start_datetime, end_datetime, overwrite_title, level_id, notifications_enabled, status (scheduled|canceled|rescheduled|completed), notes, max_players, overridden_fields (JSON)

### Rules
1. **Lazy materialization**: Instances for recurring lessons are NOT pre-created. They are created on-demand when:
   - A reminder job fires for that date
   - A coach manually opens that date on the calendar
   - `get_or_materialize_instance(lesson, date)` is called
2. On materialization:
   - Instance created from lesson template (`data_for_instance()`)
   - Presences created (invited=True, confirmed=False) for all enrolled players
   - Scheduler jobs set up for reminders and invitation batches
   - Standing waiting list entries synced
3. Materialization is idempotent (safe to call multiple times)
4. Status transitions: scheduled → completed, scheduled → canceled, scheduled → rescheduled
5. **Not every step of rule 2 is essential.** Creating the instance row, its presences, and its
   scheduler jobs are essential — if one fails, materialization fails. Syncing standing waiting
   list entries is **best-effort**: it runs inside a SAVEPOINT and any failure in it must be
   contained, leaving the already-committed instance usable by the caller. A coach notifying a
   class must never see their request fail because a waiting-list side effect broke. Containment
   is never silent — every contained failure is logged at ERROR with its traceback, because
   reaching it means a callee misbehaved and that must stay diagnosable.
6. **The containment must not itself be able to raise.** Two shapes are guarded:
   - The savepoint is opened **before** the `try` that guards it, never inside it. An `except`
     branch that references a savepoint which was never opened raises `UnboundLocalError` and
     masks the original error.
   - The rollback is itself guarded. If the guarded block committed before failing, it ended the
     caller's transaction, and `savepoint.rollback()` raises the same "transaction is closed"
     error — which would escape as an HTTP 500, the exact failure the guard exists to prevent.
7. **Dead-session recovery.** When the guarded block has closed the transaction, containment is:
   log at ERROR with the traceback (this state means a callee violated the no-commit contract
   documented on `_sync_standing_entries_for_new_instance`, and must be diagnosable), call
   `db.session.rollback()` to restore a usable session for the rest of the request, and return the
   materialized instance — it was committed before the guarded block ran and is therefore valid.
   Waiting list rows staged inside the savepoint may or may not have persisted; rule 3's
   idempotency means a later materialization call reconciles them.

### Acceptance Criteria

#### Lazy materialization
- **Given** a recurring lesson on Mondays at 10:00 with players Alice and Bob
- **When** the reminder job fires for April 20
- **Then** a LessonInstance is created for April 20 10:00-11:00
- **And** two Presence records are created (one for Alice, one for Bob) with invited=True

#### Instance status update
- **Given** a lesson instance with id 10 in status `scheduled`
- **When** coach POSTs to `/api/app/lesson_instance/10/status` with `{"status": "completed"}`
- **Then** the instance status changes to `completed`

#### A failing standing-waiting-list sync does not fail materialization
- **Given** a recurring lesson with an enrolled player, whose coach has an active standing waiting
  list entry, and whose occurrence for that date has never been materialized
- **When** the coach POSTs `/api/app/notify/send_reminders` for that occurrence and the standing
  entry sync raises a plain exception
- **Then** the request returns 200, the LessonInstance for that date exists, and the reminder is
  actually delivered to the enrolled player

#### A sync failure that closes the transaction is contained, not surfaced
- **Given** the same setup
- **When** the standing entry sync commits and *then* raises, closing the caller's transaction
- **Then** the request still returns 200 and the reminder is still actually delivered — not a 500
  `ResourceClosedError`
- **And** the failure is logged at ERROR level with its traceback

#### A savepoint that cannot be opened surfaces its own cause
- **Given** the same setup
- **When** opening the SAVEPOINT itself raises
- **Then** the error surfaced is that failure, never an `UnboundLocalError` from the guard

---

## classes.enrollment

---
id: classes.enrollment
status: implemented
depends_on: [classes.create, players.create]
---

### Intent
Manage which players are enrolled in a class (lesson template level).

### Entities
- **Association_PlayerLesson** (`player_in_lesson`): player_id, lesson_id (unique pair)
- **Association_PlayerLessonInstance** (`player_in_lesson_instance`): player_id, lesson_instance_id (unique pair)

### Rules
1. Players enrolled at the lesson level appear in ALL future instances
2. Players can also be added to specific instances only
3. Enrollment at lesson level auto-creates presences when instances are materialized

---

## classes.instance-enrollment

---
id: classes.instance-enrollment
status: implemented
depends_on: [classes.instances, players.create]
---

### Intent
Manage player enrollment at the instance level (per-occurrence), separate from the lesson template enrollment.

### Rules
1. `Association_PlayerLessonInstance` links players to specific instances
2. Used for one-off additions (e.g., substitute players, invitation acceptances)
3. Players added this way get a Presence record for that instance

---

## classes.coach-assignment

---
id: classes.coach-assignment
status: implemented
depends_on: [classes.create]
---

### Intent
Assign coaches to classes and specific instances.

### Entities
- **Association_CoachLesson** (`coach_in_lesson`): coach_id, lesson_id
- **Association_CoachLessonInstance** (`coach_in_lesson_instance`): coach_id, lesson_instance_id

### Rules
1. Multiple coaches can be assigned to a class
2. Coach assignment at lesson level propagates to all instances
3. Instance-level overrides are possible

---

## classes.recurrence

---
id: classes.recurrence
status: implemented
depends_on: [classes.create]
---

### Intent
Support recurring class schedules with configurable frequency and end dates.

### Rules
1. `recurrence_rule` is a JSON object: `{frequency: "weekly", daysOfWeek: [0-6], interval: N}`
2. `recurrence_end` is an optional Date that stops the series
3. Changing the day of a class updates `recurrence_rule.daysOfWeek` via `update_recurrence_weekday()`
4. Scheduler schedules reminder jobs for the next 60-day horizon
5. A weekly job (`extend_schedule_window`) extends the horizon every 7 days

---

## classes.detail-visibility

---
id: classes.detail-visibility
status: implemented
depends_on: [classes.instances, attendance.presence, notifications.reminders]
---

### Intent
The class detail payload is role-scoped. A coach sees the full class (all participants,
everyone's attendance/absence records, and the open-spot notification/invitation log). A
student (player) sees only their own participation — never other students' data. This prevents
a student who joins a class (e.g. by accepting an open-spot notification) from viewing
coach-only information about other players.

### Rules
1. The class detail endpoint (`POST /api/app/class_instance`) is authenticated (`@jwt_required()`)
   and filters its payload based on the requesting user's role.
2. **Coach view** (requesting user is a coach): full payload — complete `participants` list, all
   `presences`, and the full `invitations` (notification) log. Unchanged from prior behavior.
3. **Student view** (requesting user is a player, not a coach): the payload includes the class's
   shared, non-sensitive fields (name, coach id, level, date/time, status, notes, planned
   exercises) plus ONLY the student's own data:
   - `participants` MUST NOT contain other students. It is empty, or contains only the requesting
     student's own player entry.
   - `presences` MUST contain only the requesting student's own presence row (their status /
     justified-or-unjustified absence). Other students' presence and absence records are omitted.
   - `invitations` MUST contain only notification events addressed to the requesting student (or be
     empty). Who else received open-spot notifications is never exposed to a student.
4. Any endpoint returning per-instance presence data (`GET /api/app/lesson_instance/<id>` and
   `GET /api/app/lesson_instance/<id>/presences`) is authenticated and applies the same
   student-scoping: a student receives only their own presence row.

### Acceptance Criteria

#### Coach sees the full class detail
- **Given** a coach who owns a class instance with players Alice and Bob, where Bob is absent
- **When** the coach requests the class instance detail
- **Then** the payload lists both Alice and Bob in `participants`
- **And** includes both players' `presences` (including Bob's absence + justification)
- **And** includes the full `invitations`/notification log

#### Student sees only their own class detail
- **Given** a student (Alice) enrolled in a class instance that also has Bob, with open-spot
  notifications sent to other players
- **When** Alice requests the same class instance detail
- **Then** the payload does NOT contain Bob (or any other student) in `participants`
- **And** `presences` contains only Alice's own record — no other student's presence/absence
- **And** `invitations` does not reveal notifications sent to other players
- **And** Alice can still see the class name, coach, date/time and her own status

### Notes
- Source: ticket PAD-36 (privacy leak — student sees restricted class info).

---

## classes.join-requests

---
id: classes.join-requests
status: draft
depends_on: [eligibility.open-spot-visibility, eligibility.enforcement, classes.instances, notifications.invitations, messaging.messages]
---

### Intent
A student who can see an open spot (`eligibility.open-spot-visibility`) can **ask to attend**. The
coach accepts or rejects. A spot can therefore now be filled two ways — by the invitation engine or
by a student's request — and whichever lands first wins.

### Entities
- **ClassJoinRequest** (`class_join_requests`): lesson_instance_id, player_id, coach_id,
  status (`pending` | `accepted` | `rejected` | `withdrawn` | `superseded`), created_at, decided_at,
  decided_by_coach_id. Unique on `(lesson_instance_id, player_id)` among `pending` rows.

### Rules
1. **Only an eligible student may request**, and only for a class that is visible to them with an
   empty spot. Eligibility is re-checked server-side on request — a client that shows a stale
   calendar cannot create an ineligible request.
2. **Requesting a non-materialized recurrence occurrence materializes it first**
   (`get_or_materialize_instance`), because a request must attach to a real instance. This is the
   one path where a student's action creates an instance row.
3. A student may not request a class they are already enrolled in, and a second `pending` request for
   the same class is idempotent rather than a duplicate.
4. A student may **withdraw** their own pending request. Withdrawal is silent — no coach alert.
5. **The coach is notified of every request** and accepts or rejects it. Acceptance and rejection are
   the coach's alone; nothing about a request is automatic.
6. **On accept**, the student is enrolled exactly as any other enrolment: enrolment association plus
   presence, through the same path the invitation engine uses (`_add_player_to_instance`). Any
   vacancy for that spot is marked filled and attributed to the requesting student.
7. **Eligibility is re-checked at accept time.** Between request and decision the student's level or
   absence record may have changed. A student who no longer passes the bar is not silently enrolled:
   the coach gets the same named-reason warning as a manual add (`eligibility.enforcement` rule 7)
   and may proceed anyway — accepting a request is a manual add.
8. **On accept, a credit is consumed exactly as a normal enrolment consumes one.** In the current
   schema the only credit balance that exists is `StandingWaitingListEntry.credits_*`, so this means:
   if the requesting student holds an active standing waiting-list entry with that coach, accepting
   consumes one of its credits and deactivates the entry when the cap is reached, exactly as
   `notifications.waiting-list` rule 2 does for a placement. A student with no standing entry has no
   credit balance to debit and is enrolled without one. **This rule is the open question flagged with
   the stakeholder** — if "credit" is meant to be a general per-enrolment balance, that is a new
   entity and this rule changes.
9. **On reject, nothing happens** — the request closes as `rejected`, the spot stays open, and the
   student is told.
10. **First fill wins.** The moment a spot is filled by any path — an accepted request, an accepted
    invitation, a waiting-list placement, or a manual add — that spot is gone:
    - the class stops appearing as an open spot in every student's calendar;
    - invitation messages already sent for it are retired exactly as they are today when a spot is
      taken (the existing `spot_filled` / invite-retirement path);
    - all other `pending` requests for that spot become `superseded`.
11. **Superseded requesters are answered according to the coach's `auto_notify_enabled` setting:**
    - **On** — the system replies to each of them automatically ("this spot has been taken").
    - **Off** — no automatic reply is sent; the coach answers them by hand, as they wish.
12. **The coach is alerted in chat either way.** Whether auto-notification is on or off, the coach
    receives a "this class is now full" alert naming the pending requests that were superseded. The
    setting only controls whether the *students* get an automatic reply, never whether the coach is
    kept in the loop.
13. **Semi-automatic mode does not gate requests.** `invitation_mode: semi_automatic`
    (`notifications.semi-auto-approval`) exists so a coach approves before the engine solicits
    anybody. A join request is already a coach decision, so it can be accepted regardless of a
    vacancy's `approval_status`, and accepting it resolves any pending approval prompt for that
    vacancy — the spot it guarded is gone.
14. Requests for a class that has started, been cancelled or completed are rejected by the server and
    any still-pending requests for it are closed.

### Acceptance Criteria

#### Eligible student requests an open spot
- **Given** an eligible student seeing a visible class with an empty spot
- **When** they request to attend
- **Then** a ClassJoinRequest is created with status `pending`
- **And** the coach is notified

#### Coach accepts
- **Given** a pending request
- **When** the coach accepts
- **Then** the student is enrolled with an association and a presence
- **And** any vacancy for that spot is marked filled and attributed to that student
- **And** the request status becomes `accepted`

#### Coach rejects
- **Given** a pending request
- **When** the coach rejects
- **Then** the request status becomes `rejected`
- **And** the student is not enrolled, the spot stays open, and the student is told

#### Requesting a virtual occurrence materializes it
- **Given** an eligible student and a visible, never-materialized recurrence occurrence with room
- **When** they request to attend it
- **Then** the LessonInstance for that date is created
- **And** the request attaches to it

#### An invitation filling the spot supersedes pending requests, auto-reply on
- **Given** a class with one open spot, two pending join requests, and `auto_notify_enabled` true
- **When** an invited student accepts the invitation
- **Then** both requests become `superseded`
- **And** both requesters receive an automatic "this spot has been taken" reply
- **And** the coach receives a "class is now full" chat alert naming both
- **And** the class no longer appears as an open spot in any student's calendar

#### Same contention with auto-reply off
- **Given** the same setup with `auto_notify_enabled` false
- **When** the spot is filled
- **Then** both requests become `superseded`
- **And** neither requester receives an automatic reply
- **And** the coach still receives the "class is now full" chat alert naming both

#### An accepted request retires outstanding invitations
- **Given** a class with one open spot and two invitations already sent
- **When** the coach accepts a student's join request instead
- **Then** the vacancy is filled by the requesting student
- **And** the two outstanding invitation messages are retired exactly as they are when a spot is
  taken today

#### A student who fell below the bar is not silently enrolled
- **Given** a pending request from a student who was eligible when they requested
- **And** whose absence record has since put them over the coach's limit
- **When** the coach opens the request
- **Then** accepting warns with the named reason before enrolling
- **And** the coach may still proceed

#### A student cannot request a class they are already in
- **Given** a student enrolled in a class
- **When** they attempt to request it
- **Then** the request is rejected by the server

### Notes
- Rule 8 (credit consumption) is the one rule carrying an explicit assumption; see the flag in the
  rule text.
