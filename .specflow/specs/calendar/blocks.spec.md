---
id: calendar.blocks
status: implemented
depends_on: [auth.login]
implements: ../../specs-business/calendar/coach-relies-on-calendar.business.md
governed_by: []
---

# calendar.blocks


### Intent
Users create personal calendar blocks to mark unavailability (breaks, holidays, off-work, personal).

### Entities
- **CalendarBlock** (`calendar_blocks`): user_id, type (break|holiday|off_work|personal|unavailable), start_datetime, end_datetime, is_recurring, recurrence_rule, recurrence_end, blocks_auto_invitations, title, description

### Rules
1. Types: `break`, `holiday`, `off_work`, `personal`, `unavailable`
2. Blocks can be recurring (same recurrence system as lessons)
3. CRUD via: POST/PATCH/DELETE `/api/app/calendar_block/{id}`
4. Blocks have sub-events: `POST /api/app/calendar_block/{id}/event`
5. Blocks can be rescheduled: `POST /api/app/calendar_block/{id}/reschedule`
6. Reschedule supports scope: single occurrence or all future
7. `blocks_auto_invitations` (bool, default false): when true, the block suppresses AUTOMATIC class invitations for the owning user during its window (see calendar.student-blockers)

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
