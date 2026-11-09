---
id: calendar.blocks
status: implemented
depends_on: [auth.login]
serves: [P-CALENDAR-1]
governed_by: []
---

# calendar.blocks


### Intent
Users create personal calendar blocks to mark unavailability (breaks, holidays, off-work, personal).

### Entities
- **CalendarBlock** (`calendar_blocks`): user_id, type (break|holiday|off_work|personal|unavailable), start_datetime, end_datetime, is_recurring, recurrence_rule, recurrence_end, blocks_auto_invitations, title, description — indexed on user_id

### Rules
1. Types: `break`, `holiday`, `off_work`, `personal`, `unavailable`
2. Blocks can be recurring (same recurrence system as lessons)
3. CRUD via: POST/PATCH/DELETE `/api/app/calendar_block/{id}`
4. Blocks have sub-events: `POST /api/app/calendar_block/{id}/event`
5. Blocks can be rescheduled: `POST /api/app/reschedule_block/{id}` with `{occDate, newDate, newStartTime, newEndTime, scope}` (the route the two shells call; this rule used to name `/calendar_block/{id}/reschedule`, which does not exist — corrected in PAD-371)
6. Reschedule supports scope: `single` (that occurrence only) or `future` (that occurrence and every later one)
7. `blocks_auto_invitations` (bool, default false): when true, the block suppresses AUTOMATIC class invitations for the owning user during its window (see calendar.student-blockers)

8. **Delete takes the same scope (PAD-371, B-139).** `DELETE /api/app/calendar_block/{id}` with `{occDate, scope}`: `single` removes that occurrence only, `future` ends the series the day before it, and no `occDate` (or a one-off block) deletes the block. Both shells offer "this one / this and following" on a recurring event; web also on drag-and-drop (rule 5) — except on the live hold of an open class request, where both scopes are refused with `409 HOLD_OCCURRENCE_LOCKED` and the shells offer only the whole delete (`classes.class-requests` rule 3, PAD-372; the feed item and the block detail say so via `requestHoldOf`). Editing (`PUT`) takes no scope and changes the whole series.
9. **Changing ONE occurrence leaves every other occurrence as it was (PAD-371, B-139).** A `single` delete or move of a middle occurrence ends the original series the day before it and **resumes** the series, as a second block, from the next occurrence on a LATER DATE, keeping the original end (or none, for an endless series). The first occurrence advances the series' start instead; the last occurrence resumes nothing; the only occurrence deletes the block. "Next" excludes the whole of the occurrence's own date — a search from that date's midnight finds the occurrence itself. A series can therefore be two rows after one such change: anything that holds a block by id (a class-request hold, `classes.class-requests` rule 3) sees only the first — PAD-372.
10. **An edit changes recurrence only when its body says so (PAD-377, B-150).** `PUT /api/app/calendar_block/{id}` (and `PUT /api/app/availability_blockers/{id}`, which shares the service): an explicit `isRecurring: false` makes the block a one-off AND clears `recurrence_rule` and `recurrence_end`; `isRecurring: true` writes the rule and end date sent; a body that OMITS the key (or sends null) leaves the flag, the rule and the end date exactly as they were. Everything that repeats a block reads the **rule**, not the flag — the calendar feed and the invitation engine (`calendar.student-blockers` rule 5) — so a rule left behind on a "one-off" keeps repeating it. The clearing is done in `edit_event_service`; the shared form layer, which drops empty values, is deliberately unchanged here (PAD-367). Rows already damaged are NOT repaired by this rule: that data repair is held by the coordinator.

11. **What was sent is what is written (PAD-386, B-136).** `PUT /api/app/calendar_block/{id}` (and
    `PUT /api/app/availability_blockers/{id}`, which shares the service) writes only the keys present in
    the body, from a whitelist — `type, title, description, date, startTime, endTime, isRecurring,
    recurrenceRule, endDate`; the owner and the PAD-93 flag cannot be reached from a body. A present
    `null` or `""` clears `title` and `description`. A missing or empty `type`, `date`, `startTime` or
    `endTime` is answered `400 {"error": "invalid_fields", "fields": [...]}` and nothing is written
    (they were a KeyError or a ValueError — a 500). **A block that still recurs keeps its end (D83,
    2026-09-22):** a present `null`/`""` `endDate` while `isRecurring` is true, or absent on a block
    with a rule, is answered 400 `["endDate"]` — a NULL end means "forever" downstream and nothing
    creates one on purpose; the way to drop the end is `isRecurring: false`, which clears rule and end
    (rule 10). A recurring block without a `recurrenceRule` is 400 `["recurrenceRule"]`. Both shells'
    edit sheets say so before the request, as their create sheets already do.

### Acceptance Criteria

#### CALENDAR-BLOCKS-1: Create calendar block
- **Given** an authenticated coach
- **When** they POST to `/api/app/calendar_block` with `{"type": "holiday", "title": "Easter Break", "start_datetime": "2026-04-05T00:00", "end_datetime": "2026-04-07T23:59"}`
- **Then** a CalendarBlock record is created
- **And** it appears on the calendar in the date range

#### CALENDAR-BLOCKS-2: Reschedule block
- **Given** a recurring block on Fridays
- **When** coach POSTs to reschedule with `{"occDate": "2026-04-17", "newDate": "2026-04-18", "scope": "single"}`
- **Then** only the April 17 occurrence moves to April 18
- **And** the Friday occurrences after April 17 are still there, at their own time

#### CALENDAR-BLOCKS-3: Deleting one occurrence keeps the rest (PAD-371)
- **Given** a weekly Thursday block from 2026-10-01 to 2026-10-29
- **When** the coach deletes the 2026-10-15 occurrence with scope `single`
- **Then** the calendar serves Oct 1, 8, 22 and 29, and the series still ends on 2026-10-29
- **When** instead they delete the 2026-10-01 occurrence with scope `single`
- **Then** the calendar serves Oct 8, 15, 22 and 29
- **When** instead they delete the 2026-10-29 occurrence with scope `single`
- **Then** the calendar serves Oct 1, 8, 15 and 22, and the block is still one row

#### CALENDAR-BLOCKS-4: An event edited to a one-off stops repeating (PAD-377)
- **Given** a weekly Monday block from 2026-10-05 to 2026-10-26
- **When** its owner saves it with `isRecurring: false`
- **Then** the row has no recurrence rule and no end date, and the calendar serves it on one day
- **When** instead the owner saves an edit whose body has no `isRecurring` key
- **Then** the block is still weekly, with the same rule and end date

#### CALENDAR-BLOCKS-5: An emptied title or description is cleared; a required key is refused (rule 11)
- **Given** the coach's block "Dentist" with a description
- **When** the sheet sends the full body with `"title": null, "description": null`
- **Then** the answer is 200 and both are NULL
- **When** the body lacks `date` (or sends `""` for `startTime`)
- **Then** the answer is 400 naming it and the block is unchanged

#### CALENDAR-BLOCKS-6: A recurring block keeps its end date (rule 11, D83)
- **Given** a weekly block ending 2026-12-01
- **When** the coach's sheet sends the full body with `"isRecurring": true` and `"endDate": null`
- **Then** the answer is 400 with `fields` `["endDate"]` and nothing changed — the title beside it included
- **When** instead it sends `"isRecurring": false`
- **Then** the rule and the end are cleared (rule 10)

#### CALENDAR-BLOCKS-7: An edit writes what it sends, keeps what it leaves out, and cannot change the owner or the invitation flag (rules 10, 11)
- **Given** a coach's block "Dentist" with a description, and a weekly block
- **When** the coach PUTs `/api/app/calendar_block/<id>` with a new time and no title or description, and then with a title, `user`, `user_id` and `blocks_auto_invitations`
- **Then** the first writes the time and keeps the title and the description
- **And** the second writes the title; the owner and the invitation flag are as they were
- **And** an edit of the weekly block that leaves out `recurrenceRule` keeps its rule, and one that sends it as null is 400 naming `recurrenceRule`
- **And** an edit that sends a rule and an end date writes them: a nearer end date shortens the series, and a one-off given a rule repeats again
test: `backend/padel_app/tests/test_pad367_falsy_values_at_the_route.py` › `test_calendar_edit_ignores_what_is_not_the_blocks_own_form` (+6 more)

#### CALENDAR-BLOCKS-8: Deleting or moving from one occurrence on leaves the earlier ones as they were (rules 6, 8, 9)
- **Given** a weekly Thursday block at 10:00 from 1 to 29 October
- **When** the coach deletes, or moves to 15:00, "this and following" on 15 October
- **Then** the delete leaves 1 and 8 October and ends the series the day before the 15th
- **And** the move leaves 1 and 8 October at 10:00 and puts 15, 22 and 29 October at 15:00
- **And** moving only the first occurrence leaves nothing at its old time
- **And** deleting one occurrence of a series with no end leaves it endless, and deleting the only occurrence left deletes the block
test: `backend/padel_app/tests/test_pad371_single_occurrence_keeps_series.py` › `test_deleting_one_occurrence_of_an_endless_series_keeps_it_endless` (+5 more)

#### CALENDAR-BLOCKS-9: The iOS block screen shows dates in the app's language and saves what its form holds (rule 11; `settings.language` rule 3)
- **Given** the iOS screen of a block on 7 September 2026
- **When** it is shown in Portuguese and in English, and the coach edits and saves
- **Then** the date is written weekday first, then the day and the month, in that language (a Monday in September), and a value that is not a date is shown as written
- **And** the form opens on the block's own values, with the occurrence's date and time where the block has none
- **And** a save with repeat off sends no rule and no end date; with repeat on it sends the weekly rule with its days and the end date
test: `frontend/apps/mobile/src/features/calendar/event-draft.test.ts` › `renders the weekday and month in the given locale` (+12 more)

### Open questions

- **P-CALENDAR-1 says a block "can suppress automatic invitations sent to its owner"; no coach can set that.** The flag is written only by the student's availability path (`student_availability_service.py:65`, `:77`). A coach's own block never carries it: the create and edit routes leave it out (`calendar_service.py:89-103`, `:167-168`), and CALENDAR-BLOCKS-7 pins that an edit cannot set it. Recommendation: say in the promise that it is the student's availability block that suppresses invitations (P-CALENDAR-4), or build the coach's switch. The promise was not changed tonight.
- **Rule 3 and CALENDAR-BLOCKS-1 name `start_datetime` and `end_datetime` in the create body; the shells send `date`, `startTime` and `endTime`.** The reader of this spec did not locate the create route to confirm which the server reads. Recommendation: check the route and restate the criterion with the body the apps send.
- **Rule 8 refuses dragging a live class-request hold with 409 `HOLD_OCCURRENCE_LOCKED`; no criterion states it and P-CALENDAR-3's dragging bullet omits it.** Recommendation: add the criterion.
