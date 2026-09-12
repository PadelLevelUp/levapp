---
id: classes.delete
status: implemented
depends_on: [classes.create]
implements: ../../specs-business/classes/coach-schedules-recurring-classes.business.md
governed_by: []
---

# classes.delete


### Intent
Delete a class or specific occurrence. Supports deleting single or future occurrences.

### Rules
1. `DELETE /api/app/class/{lesson_id}` deletes the lesson and all instances (CASCADE)
2. `DELETE /api/app/lesson_instance/{instance_id}` deletes a single instance
3. Scope: `single` (cancel one occurrence — an exclusion on the lesson, `classes.recurrence` rule 7, once PAD-275's column exists; the PAD-65 split until then) or `future` (end series)
4. Deleting cancels associated scheduler jobs

### Acceptance Criteria

#### Delete single occurrence
- **Given** a recurring class with instances on April 13, 20, 27
- **When** coach deletes the April 20 instance with scope `single`
- **Then** only the April 20 instance is removed
- **And** April 13 and 27 remain
