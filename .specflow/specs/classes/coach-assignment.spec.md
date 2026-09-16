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
- **Association_CoachLessonInstance** (`coach_in_lesson_instance`): coach_id, lesson_instance_id — unique on (coach_id, lesson_instance_id), indexed on lesson_instance_id (kept; PAD-275 rule 4 reads it through `coaches_for`)

### Rules
1. Multiple coaches can be assigned to a class
2. Coach assignment at lesson level propagates to all instances
3. Instance-level overrides are possible (the instance junction wins when present, rule 4)
4. **One helper answers "who coaches this occurrence" (PAD-275, audit M2; decided 2026-09-11: KEEP `coach_in_lesson_instance`, no `coach_override_id`, no data move).** `coaches_for(instance)` returns the instance's own coach rows when it has any, else the lesson's coaches; `primary_coach(instance)` is the first of those. The calendar, the engine's "the coach" reads (`coaches_relations[0]`, `.first()`) and the eligibility report all go through the helper, so an occurrence with no coach junction row (9 of 13 on the dev database at audit time) is no longer coach-less. Multi-coach occurrences stay possible through the junction; the code reads a primary coach

### Acceptance Criteria

#### An occurrence with no coach row of its own is coached by its lesson (rule 4)
- **Given** a materialised occurrence whose `coach_in_lesson_instance` rows were removed, and a lesson coached by Ana
- **When** `coaches_for(instance)` and the coach's calendar are read
- **Then** the occurrence's coaches are [Ana] and Ana's calendar shows it
- **And** after a substitute row is added for that occurrence, its coaches are [the substitute], the substitute's calendar shows it and Ana's does not
