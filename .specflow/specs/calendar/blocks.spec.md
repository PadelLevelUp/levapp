---
id: calendar.blocks
status: implemented
depends_on: [auth.login]
implements: ../../specs-business/calendar/coach-blocks-personal-time.business.md
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

#### Create calendar block
- **Given** an authenticated coach
- **When** they POST to `/api/app/calendar_block` with `{"type": "holiday", "title": "Easter Break", "start_datetime": "2026-04-05T00:00", "end_datetime": "2026-04-07T23:59"}`
- **Then** a CalendarBlock record is created
- **And** it appears on the calendar in the date range

#### Reschedule block
- **Given** a recurring block on Fridays
- **When** coach POSTs to reschedule with `{"occDate": "2026-04-17", "newDate": "2026-04-18", "scope": "single"}`
- **Then** only the April 17 occurrence moves to April 18
- **And** the Friday occurrences after April 17 are still there, at their own time

#### Deleting one occurrence keeps the rest (PAD-371)
- **Given** a weekly Thursday block from 2026-10-01 to 2026-10-29
- **When** the coach deletes the 2026-10-15 occurrence with scope `single`
- **Then** the calendar serves Oct 1, 8, 22 and 29, and the series still ends on 2026-10-29
- **When** instead they delete the 2026-10-01 occurrence with scope `single`
- **Then** the calendar serves Oct 8, 15, 22 and 29
- **When** instead they delete the 2026-10-29 occurrence with scope `single`
- **Then** the calendar serves Oct 1, 8, 15 and 22, and the block is still one row

#### An event edited to a one-off stops repeating (PAD-377)
- **Given** a weekly Monday block from 2026-10-05 to 2026-10-26
- **When** its owner saves it with `isRecurring: false`
- **Then** the row has no recurrence rule and no end date, and the calendar serves it on one day
- **When** instead the owner saves an edit whose body has no `isRecurring` key
- **Then** the block is still weekly, with the same rule and end date

#### An emptied title or description is cleared; a required key is refused (rule 11)
- **Given** the coach's block "Dentist" with a description
- **When** the sheet sends the full body with `"title": null, "description": null`
- **Then** the answer is 200 and both are NULL
- **When** the body lacks `date` (or sends `""` for `startTime`)
- **Then** the answer is 400 naming it and the block is unchanged

#### A recurring block keeps its end date (rule 11, D83)
- **Given** a weekly block ending 2026-12-01
- **When** the coach's sheet sends the full body with `"isRecurring": true` and `"endDate": null`
- **Then** the answer is 400 with `fields` `["endDate"]` and nothing changed — the title beside it included
- **When** instead it sends `"isRecurring": false`
- **Then** the rule and the end are cleared (rule 10)
