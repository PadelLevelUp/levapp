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
