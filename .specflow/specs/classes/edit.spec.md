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

7. **What was sent is what is written (PAD-387, B-136).** `POST /api/app/edit_class` writes only the
   keys present in `updates`; an omitted key — `isRecurring` included — is left alone on every scope.
   A present `null` or `""` clears a nullable field: `levelId` ("all levels"), `recurrenceEnd`,
   `color`, `courtId` (rule 6). For `name` and `maxPlayers`, which cannot be empty — and 0 is not a
   legal capacity — a present empty value is answered `400 {"error": "invalid_fields", "fields":
   [...]}` naming every such field, and nothing is written, on any scope. An occurrence's title
   override is touched only by an edit that sent `name`.

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

#### Capacity is an override only when it differs (rule 4)
- **Given** a class of 4 and a materialised occurrence of it
- **When** the occurrence is read
- **Then** `max_players_override` is NULL and `effective_max_players` is 4
- **And** raising the class to 6 makes the occurrence's effective capacity 6, while setting the occurrence's own capacity to 2 makes it 2 and lists `maxPlayers` in `overriddenFields`

#### An emptied nullable field clears; an emptied required one is refused (rule 7)
- **Given** a weekly class "Thursday group" with level 5, colour #112233 and an end date
- **When** the coach sends `updates: {"levelId": null}`, then `{"recurrenceEnd": ""}`, then `{"color": ""}`
- **Then** each answers 201 and the class has no level, no end date and no colour, the other
  fields unchanged; it is still recurring
- **When** the coach sends `{"name": "", "color": "#abcdef"}` or `{"maxPlayers": 0, "color": "#abcdef"}`
- **Then** the answer is 400 with `fields` `["title"]` / `["max_players"]` and the colour is unchanged

#### An edit without a name keeps the occurrence's title override (rule 7)
- **Given** an occurrence renamed "Just today" through a single-scope edit
- **When** the coach edits that occurrence's capacity only
- **Then** it is still called "Just today"
