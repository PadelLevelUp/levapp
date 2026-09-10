---
id: classes.coach-assignment
status: implemented
depends_on: [classes.create]
implements: ../../specs-business/classes/coach-runs-class-occurrences.business.md
governed_by: []
---

# classes.coach-assignment


### Intent
Assign coaches to classes and specific instances.

### Entities
- **Association_CoachLesson** (`coach_in_lesson`): coach_id, lesson_id — unique on (coach_id, lesson_id), indexed on lesson_id
- **Association_CoachLessonInstance** (`coach_in_lesson_instance`): coach_id, lesson_instance_id — unique on (coach_id, lesson_instance_id), indexed on lesson_instance_id

### Rules
1. Multiple coaches can be assigned to a class
2. Coach assignment at lesson level propagates to all instances
3. Instance-level overrides are possible
