---
id: classes.edit
status: implemented
depends_on: [classes.create]
implements: ../../specs-business/classes/coach-schedules-recurring-classes.business.md
governed_by: []
---

# classes.edit


### Intent
Edit a class or a specific instance. Supports editing single occurrences or all future occurrences of a recurring class.

### Rules
1. `PATCH /api/app/class/{lesson_id}` edits the parent lesson template
2. `PATCH /api/app/lesson_instance/{instance_id}` edits a specific instance
3. Scope parameter: `single` (just this occurrence) or `future` (this and all future)
4. **Instance overrides are nullable columns; NULL inherits (PAD-275, audit M1b).** A materialised occurrence stores only what differs from its lesson: `overwrite_title` is written only when the value differs from `lesson.title` (materialisation leaves it NULL, so a series rename reaches every occurrence that was not renamed on its own); `level_id` NULL inherits `default_level_id` (as today); `max_players_override` NULL inherits `lesson.max_players` through `LessonInstance.effective_max_players` (HELD: the column and its migration wait for the owner's decisions 9–11 of the 2026-09-11 list — until then `max_players` stays the copied column); start and end times stay copied, because an occurrence's time is its own fact once a single edit moves it. `overriddenFields` in the class-instance payload is **derived** from the non-NULL overrides; the `overridden_fields` text column is never written and is dropped with the migration
5. Changing lesson time reschedules all future reminder/invitation jobs
6. **Court (PAD-194).** `updates.courtId` sets the class's court (null clears it; omitted leaves it);
   it must belong to the class's club (`clubs.courts` rule 6). A "this and future" split copies the court.

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
