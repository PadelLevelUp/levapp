---
id: attendance.presence
status: implemented
depends_on: [classes.instances, players.create]
implements: ../../specs-business/attendance/coach-relies-on-attendance.business.md
governed_by: []
---

# attendance.presence


### Intent
Track player attendance for each class instance, including invitation, confirmation, and validation status.

### Entities
- **Presence** (`presences`): lesson_instance_id, player_id, status (present|absent|null), justification (justified|unjustified|null), invited (bool), confirmed (bool), validated (bool)
- Unique constraint: (player_id, lesson_instance_id)

### Rules
1. Presences are auto-created when an instance is materialized (invited=True, confirmed=False)
2. Players confirm attendance via reminders (confirmed=True)
3. Coach marks final attendance: status=present or status=absent
4. Absent players can be marked justified or unjustified
5. `validated=True` means the coach has finalized the attendance record

### Acceptance Criteria

#### Auto-create presences
- **Given** a class with players Alice and Bob
- **When** the instance for April 20 is materialized
- **Then** two Presence records are created with invited=True, confirmed=False, status=null

#### Mark attendance
- **Given** an instance with 4 presences
- **When** coach POSTs to `/api/app/lesson_instance/{id}/confirm_presences` with status for each player
- **Then** each presence.status is updated (present or absent)
- **And** absent players have justification set
