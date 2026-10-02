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
   keys present in `updates`; an omitted key — `isRecurring` and `recursUntilSeasonEnd` included — is
   left alone. What a present `null` or `""` does depends on the column, decided per key:
   - **Series scopes (`future`, `all`, and a `Lesson` event):** `levelId` clears to "all levels";
     `color` clears; `courtId` clears (rule 6). `recurrenceEnd` may NOT be emptied while the lesson
     has a recurrence rule — a NULL end means "recurs forever" downstream, the create path refuses to
     make one (PAD-90) and `calendar.seasons` rule 10 forbids it — so it is answered 400. An explicit
     `recurrenceEnd` is the coach's: it sets `recurs_until_season_end` to false, so a later season
     save does not re-cap it. `name` and `maxPlayers` cannot be empty (0 is not a legal capacity): a
     present empty value is answered `400 {"error": "invalid_fields", "fields": [...]}` naming every
     such field, and nothing is written. The 400 is decided on the whole payload before any path
     writes or forks the series.
   - **A single occurrence (`single`):** an occurrence has no colour, end date or court of its own —
     those keys are accepted and ignored; a cleared `levelId` sets the occurrence's level to NULL,
     which INHERITS the series level (rule 4), not "all levels". An empty `name` is refused as above;
     the title override is dropped only by resending the series title (rule 4), and it is touched
     only by an edit that sent `name`.
8. **Moving an occurrence moves its weekday in the series (PAD-464, B-216).** When an edit moves a
   recurring class from `event_date` to another date, the series' `daysOfWeek` swaps the old
   weekday for the new one, in the calendar's convention: **0 = Sunday … 6 = Saturday**
   (`calendar_tools.WEEKDAY_MAP`, date-fns `getDay`), never ISO. Sunday is the day the two
   conventions disagree on, so moving onto a Sunday adds 0 and moving off a Sunday removes 0.

9. **The coach adds and removes students when editing a class, on web and in the mobile app (iOS
   and Android) (PAD-474, B-239).** In edit mode both shells replace the participant list with the
   picker of `classes.create` rule 10, seeded with the class's current participants. The change is
   sent as `updates.addPlayers` / `updates.removePlayers`, the ids added and removed; unticking a
   student and ticking them again sends nothing. It applies at the scope the coach picks (rule 3):
   `single` changes this occurrence (`classes.instance-enrollment` rule 4), `future` changes the
   series roster. Adding students runs the eligibility warning first (`eligibility.enforcement`
   rule 7d). An edit that changes only the participants is an edit, never dropped as "no changes".
   The picker applies no cap at `maxPlayers`; it shows the count.

### Acceptance Criteria

#### The coach adds and removes students in an edit (rule 9, PAD-474)
- **Given** a class with Ana
- **When** the coach edits it on the mobile app to add Bruno and remove Ana
- **Then** the save sends `addPlayers` `[Bruno]` and `removePlayers` `[Ana]`, and nothing else
- **Given** an edit that touches only the participants
- **Then** the change set is not empty and the save is sent
- **Given** an added student who fails the class's bar
- **Then** the eligibility warning names them before the save

#### A participant edit lands at the chosen scope (rule 9)
- **Given** a recurring class whose roster is Ana, and a materialised occurrence of it
- **When** the coach adds Bruno with scope `single`
- **Then** only that occurrence has Bruno, and the series roster is unchanged
- **When** the coach adds Bruno with scope `future`
- **Then** the series roster has Bruno

#### Moving onto or off a Sunday keeps the series' weekdays right (rule 8, PAD-464)
- **Given** a class recurring Monday and Wednesday (`daysOfWeek` `[1, 3]`)
- **When** the coach moves its Monday occurrence to Sunday
- **Then** `daysOfWeek` is `[0, 3]` and the series recurs on Sundays and Wednesdays
- **Given** a class recurring on Sundays (`[0]`)
- **When** the coach moves its Sunday occurrence to Tuesday
- **Then** `daysOfWeek` is `[2]` and the series no longer recurs on Sundays

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
- **When** the coach sends `updates: {"levelId": null}`, then `{"color": ""}`, on scope `future`
- **Then** each answers 201 and the class has no level and no colour, the other fields unchanged;
  it is still recurring, and its end date is still there
- **When** the coach sends `{"name": "", "color": "#abcdef"}` or `{"maxPlayers": 0, "color": "#abcdef"}`
- **Then** the answer is 400 with `fields` `["title"]` / `["max_players"]` and the colour is unchanged

#### A recurring class cannot lose its end date through an edit (rule 7)
- **Given** the same weekly class, ending 2027-03-01
- **When** the coach's web sheet sends `{"recurrenceEnd": ""}` (a cleared date input) or `null`
- **Then** the answer is 400 with `fields` `["recurrence_end"]`, and the end date is unchanged

#### An explicit end date is the coach's (rule 7)
- **Given** a class created "until season end" (flag set, end 2027-07-31)
- **When** the coach sends `{"recurrenceEnd": "2027-01-15"}`
- **Then** the end is 2027-01-15, the flag is cleared, and the class is still recurring

#### On a single occurrence a cleared level inherits (rule 7)
- **Given** the weekly class with level 5
- **When** the coach sends `{"levelId": null, "color": ""}` on scope `single`
- **Then** the answer is 201, the occurrence's own level is NULL and its effective level is 5, and
  the series is untouched

#### An edit without a name keeps the occurrence's title override (rule 7)
- **Given** an occurrence renamed "Just today" through a single-scope edit
- **When** the coach edits that occurrence's capacity only
- **Then** it is still called "Just today"
