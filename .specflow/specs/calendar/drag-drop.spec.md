---
id: calendar.drag-drop
status: implemented
depends_on: [calendar.view, classes.edit, calendar.blocks]
implements: ../../specs-business/calendar/coach-relies-on-calendar.business.md
governed_by: []
---

# calendar.drag-drop


### Intent
Coaches can drag and drop events on the calendar to reschedule them, with a confirmation dialog for scope selection.

### Rules
1. Drag a class event → triggers `editClass()` with new date/time
2. Drag a block event → triggers `rescheduleCalendarBlock()`
3. For recurring events, a dialog asks: "single" or "future" scope
4. Frontend only — calls existing edit/reschedule APIs

### Acceptance Criteria

#### Drag class to new time
- **Given** a class on Monday 10:00 displayed on the calendar
- **When** coach drags it to Tuesday 14:00 and confirms scope "single"
- **Then** that occurrence is rescheduled to Tuesday 14:00
