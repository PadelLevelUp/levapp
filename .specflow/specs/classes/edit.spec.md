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
   One occurrence of a series may have a court of its own (`clubs.courts` rule 9, PAD-513).

7. **What was sent is what is written (PAD-387, B-136; times PAD-508, B-275).** `POST /api/app/edit_class` writes only the
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
   - **A single occurrence (`single`):** an occurrence has no colour or end date of its own —
     those keys are accepted and ignored. Its court is its own (`clubs.courts` rule 9, PAD-513): a
     court is stored on the occurrence, or refused by name, never accepted and dropped. A cleared `levelId` sets the occurrence's level to NULL,
     which INHERITS the series level (rule 4), not "all levels". An empty `name` is refused as above;
     the title override is dropped only by resending the series title (rule 4), and it is touched
     only by an edit that sent `name`.
7b. **The editor's time field (PAD-508).** The web class editor's start and end are the field of
   `classes.create` rule 8b (type or pick, quarter-hour list, never empty, end list with lengths;
   web only, for the reason given there). When the coach moves the start to or past the end, the end
   moves with it and keeps the class's length (an hour when it had none), never past 23:59; an end
   still after the new start is left alone. An end typed at or before the start is refused before
   anything is sent, with the same message as the new-class sheet.
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
   **(PAD-515, B-343; wording unconfirmed) `future` starts at the occurrence the coach is on,
   whichever model the client names.** Both shells keep `event.model = "Lesson"` for an
   occurrence of a series after it has been materialised under them (a read, an attendance
   confirm, an auto-invite — the seam B-046 named for `single`). On that path a future edit
   changed the series only, so an added student appeared from the next *virtual* occurrence on
   and the class on screen kept its old roster. Now the `Lesson` path, like the `LessonInstance`
   path, also applies the edit — roster, title, time, every sent field, rule 4's overrides
   included — to every occurrence already materialised from the boundary on, the current one
   first. Occurrences before the boundary are untouched; a forked series takes its materialised
   occurrences with it. The change is one server path both shells call, so it ships to web and
   iOS at once.
   **What the walk leaves alone (#564 review).** It is a series edit, not the coach's hand on
   each occurrence: an occurrence that has **ended** is a record and is not touched, a
   **canceled** one is not touched, a presence the coach has **validated** is not removed (it is
   theirs to change on the attendance sheet), and an added student is enrolled as `roster` —
   told once by the series add (PAD-330), never once more per materialised occurrence.

10. **Leaving a class ends its edit; leaving with unsaved changes asks first (PAD-525, B-341; rule
   number unconfirmed).** Edit mode and its draft belong to ONE class on ONE opening of its
   panel (web `ClassDetailSheet`, iOS `app/class/[id]`). They never outlive it: closing the web
   sheet (its X, Escape, a click outside) or opening another class in it, and leaving the iOS
   screen (its back button, a swipe back, a navigation that replaces it) or arriving at another
   class on it, all end edit mode and drop the draft, so the next class opens in view mode showing
   its own values. Before PAD-525 the web sheet stayed mounted across a close with `isEditing` and
   the old draft intact, and the next class rendered over the previous class's edits.
   - **Unsaved means different from the loaded class, by value** (`settings.unsaved-edits`
     rule 2): the fields of `EDITABLE_FIELDS` plus the participant diff — the same comparison the
     save makes (`diffInstance`/`diffParticipants` on web, `hasClassEditChanges` on iOS). An edit
     undone by hand is clean. The explicit Cancel button never asks: cancelling is the answer.
   - **With unsaved changes, leaving asks** "Descartar alterações?" / "Discard changes?", a
     sentence saying this class's changes are not saved, and two actions: **Descartar** /
     Discard (leave; the draft is dropped, nothing is sent) and **Continuar a editar** / Keep
     editing (stay; the panel stays open on the same class, every edit where it was). Copy
     `classDetail.unsavedChanges.*`, pt and en, both shells; the dialog and its actions carry the
     test ids `class-unsaved-dialog`, `class-unsaved-discard`, `class-unsaved-keep`.
   - **There is no Save in the prompt**, although the report asked for "guardar ou sair sem
     guardar". A save has its own sequence — the scope choice for a recurring class (rule 3), the
     overlap warning (PAD-159), the eligibility warning on added students
     (rule 9) — and a Save in a leave prompt would either skip those or nest them. The coach
     keeps editing and presses Save. Decided by the coordinator for the owner, 2026-10-07.
   - **With nothing unsaved, leaving asks nothing**, exactly as before.
   - **iOS:** while a draft is unsaved, swipe-back is off and the screen's own back button asks;
     any other removal is held by `usePreventRemove` and runs once Discard is chosen
     (`settings.unsaved-edits` rule 3's mechanism).
   - **Web limit, named:** the browser's Back/Forward and a programmatic `navigate()` do not ask
     (`settings.unsaved-edits` rule 6); the page unmounts and the draft goes with it.

### Acceptance Criteria

#### An edit never follows the coach to another class (rule 10, PAD-525)
- **Given** classes "A" and "B" on the same day, and the coach editing "A" in the web sheet with
  its name changed to "A changed"
- **When** they close the sheet and choose **Descartar**, then open "B"
- **Then** "B" opens in view mode, titled "B"; the Edit button is offered and no Save button is
  shown

#### Leaving with an unsaved change asks; Keep editing keeps everything (rule 10)
- **Given** the coach editing "A" with its name changed
- **When** they press Escape (web) or the back button (iOS)
- **Then** "Descartar alterações?" opens and the panel stays on "A"; **Continuar a editar**
  closes the question, and the name field still reads "A changed"
- **When** they leave again and choose **Descartar**
- **Then** the panel is gone, and "A" still has its saved name on the server

#### Nothing unsaved, nothing asked (rule 10)
- **Given** the coach pressed Edit on "A" and changed nothing, or changed the name and typed it back
- **When** they close the sheet or go back
- **Then** no question appears, the panel closes, and reopening "A" shows view mode

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

#### The editor sets the time from the list and by typing (rule 7b, PAD-508)
- **Given** a one-off class at 10:00–11:00 open in the web editor
- **When** the coach picks 11:00 as the start
- **Then** the end reads 12:00
- **When** they type "1030" in the end and save
- **Then** nothing is sent and the editor says the end must be after the start
- **When** they type "1215" in the end and save
- **Then** `edit_class` is sent with `startTime` 11:00 and `endTime` 12:15

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

#### "This and future" reaches the occurrence the coach is on (rule 9, PAD-515)
- **Given** a weekly class with Ana whose occurrence today is already materialised, and the
  client naming the series (`model: "Lesson"`) with today's date
- **When** the coach adds Bruno with scope `future`
- **Then** Bruno is on today's occurrence, on every later materialised occurrence, and on the
  series roster
- **When** the coach instead removes Ana with scope `future`
- **Then** Ana is off today's occurrence and off the series roster
- **Given** the same class with today's and next week's occurrences materialised
- **When** the coach adds Bruno with scope `future` on next week's occurrence
- **Then** today's occurrence does not have Bruno; next week's and the forked series do
- **Given** Ana's presence on today's occurrence validated "present"
- **When** the coach removes Ana with scope `future`
- **Then** Ana is off the series roster and her validated presence on today's occurrence stays
- **Given** two materialised occurrences, when the coach adds Bruno with scope `future`
- **Then** Bruno receives one "added to class" message
