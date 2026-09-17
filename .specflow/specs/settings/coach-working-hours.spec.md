---
id: settings.coach-working-hours
status: draft
depends_on: [settings.role-scope, auth.login]
implements: ../../specs-business/settings/coach-configures-preferences-and-access.business.md
governed_by: []
---

# settings.coach-working-hours

### Intent
A coach declares when they work, per weekday, so a student's class request is offered only
inside those hours (PAD-357). Before this the product inferred "free" from the calendar inside a
fixed 08:00–22:00 day (`classes.class-requests` rule 1) and had no way for a coach to say
otherwise.

### Entities
- **Coach** (`coaches`): `working_hours` (JSON, nullable; migration `8da963ad8591`) —
  `{"mon": [["08:00","22:00"]], "tue": [...], ..., "sun": []}`; a missing day or an empty list
  means "not working that day"; **null means not set** and the default window applies
  everywhere (`classes.availability` rule 1, `DEFAULT_WORKING_WINDOW` 08:00–22:00).

### Rules
1. `GET /app/coach/working-hours` (coach only) → `{workingHours: <json or null>, defaultWindow:
   {startTime: "08:00", endTime: "22:00"}}`. `PUT /app/coach/working-hours {workingHours}` replaces
   the whole value; `{workingHours: null}` clears it back to "not set".
2. **Validation.** Keys `mon..sun` only; each window `[start, end]` in `HH:MM`, on a 15-minute
   grid, `start < end`, windows of a day sorted and non-overlapping; anything else `400
   INVALID_WORKING_HOURS` naming the day. A day may hold several windows (a lunch break).
3. **The editor lives in Settings on both shells**, coach-only (`settings.role-scope`): seven rows,
   each with "não trabalho" or one or more start–end windows; Save persists through rule 1 and the
   success notice follows the server's confirmation (`settings.profile` rule 7). Until the coach
   saves anything the editor shows the default window as the assumption in effect.
4. **Only the availability computation reads it** (`classes.availability`). The coach's own
   calendar, blocks and the existing `free-blocks` endpoint (`classes.class-requests` rule 1) are
   unchanged; a coach may still put a class outside their working hours.

### Acceptance Criteria

#### A coach sets a week and a student sees it
- **Given** coach Ana saves `{"mon": [["09:00","13:00"],["15:00","21:00"]], "tue": [], ...}`
- **When** Ana reloads Settings
- **Then** the seven rows show exactly that, Tuesday as "não trabalho"
- **When** Bruno asks Ana's availability for next Monday
- **Then** the free windows lie inside 09:00–13:00 and 15:00–21:00 and `workingHoursSource` is `coach`

#### Invalid hours are refused by the server
- **Given** a payload with `"wed": [["18:00","17:00"]]`
- **When** the coach saves
- **Then** the answer is `400 INVALID_WORKING_HOURS` naming `wed`, nothing is stored, and the editor shows an error, not a success

#### Clearing returns to the default
- **Given** Ana saved hours earlier
- **When** she saves `workingHours: null`
- **Then** `GET` answers `workingHours: null`, and a student's availability for Ana falls back to 08:00–22:00 with `workingHoursSource: "default"`
