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
- **Association_CoachLessonInstance** (`coach_in_lesson_instance`): coach_id, lesson_instance_id — unique on (coach_id, lesson_instance_id), indexed on lesson_instance_id (PAD-275 rule 4: replaced by `lesson_instances.coach_override_id`, held)

### Rules
1. Multiple coaches can be assigned to a class
2. Coach assignment at lesson level propagates to all instances
3. Instance-level overrides are possible — as one substitute coach per occurrence (rule 4), not a second coach list
4. **Instance coaches are derived from the lesson (PAD-275, audit M2; HELD: the column and its migration wait for the owner's decisions 9–11 of the 2026-09-11 list).** `coaches_for(instance)` returns `[coach_override]` when `lesson_instances.coach_override_id` is set, else the lesson's coaches; the calendar, the engine's "the coach" reads (`coaches_relations[0]`, `.first()`) and the eligibility report all go through it, so an occurrence with no coach junction row (9 of 13 on the dev database at audit time) is no longer coach-less. `coach_in_lesson_instance` becomes a shadow written for one release and dropped with phase 2 of PAD-259's junction; more than one coach on an occurrence is listed for a hand decision by the migration, not carried
