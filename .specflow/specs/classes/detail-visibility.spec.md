---
id: classes.detail-visibility
status: implemented
depends_on: [classes.instances, attendance.presence, notifications.reminders]
implements: ../../specs-business/classes/student-joins-and-views-classes.business.md
governed_by: []
---

# classes.detail-visibility


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

5. **Reads are scoped to the class's own people (PAD-257, audit H1).** Before any of the three
   id-keyed reads (`POST /api/app/class_instance`, `GET /api/app/lesson_instance/<id>`,
   `GET /api/app/lesson_instance/<id>/presences`) returns anything, the caller must be:
   - a **coach who owns the class** (`coach_owns_lesson` / `coach_owns_instance`, the PAD-92
     helpers) **or a coach who is a member of the class's club** (`Association_CoachClub` on
     `lessons.club_id`) — colleagues cover for each other; a coach from another club gets 403; or
   - a **student enrolled in it** — an `Association_PlayerLessonInstance` or `Presence` row for
     the instance, or an `Association_PlayerLesson` row for the parent lesson. Any other student
     gets 403.
   The role check alone (rules 2–4) never suffices: an id-keyed read by a coach of another club
   used to return every participant with email and phone. 404 for an unknown id still comes
   before 403 for a known one, matching the PAD-92 write guards.

### Acceptance Criteria

#### A class is readable only by its own coaches, club colleagues and enrolled students (PAD-257)
- **Given** coach Ana owns a class at club Norte, coach Carla is another member of Norte, coach Bruno belongs to club Sul, student Rui is enrolled and student Sara is not
- **When** each calls `POST /class_instance`, `GET /lesson_instance/<id>` and `GET /lesson_instance/<id>/presences` for that class
- **Then** Ana and Carla get 200 with the coach payload, Rui gets 200 with only his own presence, and Bruno and Sara get 403 with no participant, email or phone in the body

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
