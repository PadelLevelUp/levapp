---
id: classes.enrollment
status: implemented
depends_on: [classes.create, players.create]
implements: ../../specs-business/classes/coach-runs-class-occurrences.business.md
governed_by: []
---

# classes.enrollment


### Intent
Manage which players are enrolled in a class (lesson template level).

### Entities
- **Association_PlayerLesson** (`player_in_lesson`): player_id, lesson_id (unique pair), indexed on lesson_id
- **Association_PlayerLessonInstance** (`player_in_lesson_instance`): player_id, lesson_instance_id (unique pair), indexed on lesson_instance_id

### Rules
1. Players enrolled at the lesson level appear in ALL future instances
2. Players can also be added to specific instances only
3. Enrollment at lesson level auto-creates presences when instances are materialized
