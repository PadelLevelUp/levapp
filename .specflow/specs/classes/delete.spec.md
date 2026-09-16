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
5. A one-off class has exactly one occurrence, so "delete this class" and "delete this
   occurrence" are the same act. Removing a materialised `LessonInstance` whose parent has no
   `recurrence_rule` removes the parent `Lesson` with it (instance, presences and both reminder
   jobs — the instance's and the lesson-occurrence's); the response is `deleted` (PAD-335, B-096)
6. Removing a materialised `LessonInstance` of a recurring class removes only that occurrence
   (instance and presences) and excludes its date from the series (rule 3); the response is
   `single_removed`. The scope dialog says which of the two the coach is doing
7. A removal is whole or nothing: after a 2xx no calendar fetch shows the removed occurrence in
   any state. Confirmed attendance is never lost without the coach being told: when attendance
   has been marked, the confirmation dialog says it is removed with the class

### Acceptance Criteria

#### Delete a materialised one-off
- **Given** a one-off class with two participants whose attendance the coach confirmed (which
  materialised its `LessonInstance`) and a calendar refetch since
- **When** the coach deletes the class (`remove_class` with `model=LessonInstance`)
- **Then** the response is 200 `deleted`, the `Lesson` and the instance are gone, both reminder
  jobs are cancelled
- **And** the next `GET /api/app/calendar` for that week does not contain the class

#### Delete dialog names marked attendance
- **Given** a class whose attendance has been marked
- **When** the coach opens Delete class
- **Then** the confirmation says the marked attendance is removed with the class

#### Delete single occurrence
- **Given** a recurring class with instances on April 13, 20, 27
- **When** coach deletes the April 20 instance with scope `single`
- **Then** only the April 20 instance is removed
- **And** April 13 and 27 remain
