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
  `{"mon": [["08:00","22:00"]], "tue": [...], ..., "sun": []}`; an **empty list** means "not
  working that day"; a **missing day** means the default window for that day (the editors on
  both shells always write all seven keys, so a missing key only ever comes from a hand-made
  value); **null means not set** and the default window applies everywhere
  (`classes.availability` rule 1, `DEFAULT_WORKING_WINDOW` 08:00–22:00). `workingHoursSource`
  is `coach` whenever the value is non-null, even if every day is the default.

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
7. **The editor loads once, and a load never undoes an edit (PAD-392, B-155; numbered 7 because rules 5
   and 6 arrive with PAD-361 and PAD-369).** The week is fetched when the section mounts and never
   again for the life of that mount; the load effect depends on nothing whose identity can change —
   in particular not on `t` or `toast`, which are read through refs. A load that resolves after the
   coach has touched the week does not replace it; after a successful save the week shown is the
   server's again. **Why:** `t` gets a new identity whenever the language changes — on web that is
   EVERY page load, as the account's language is applied over i18n's "pt" start; on iOS at sign-in.
   With `t` in the deps the effect re-ran and its second load replaced the week, silently undoing
   an edit made in the first moments after opening Settings (seen in a release run: the second
   `GET /coach/working-hours` resolved 6 ms and 1 ms after the click it undid). The same rule holds
   for every Settings section that loads into an editable form — `calendar.seasons` rule 15,
   `evaluations.categories` rule 8 — and a guard test (`apps/web/src/lib/loading-effects-deps.test.ts`)
   fails when a loading hook in either shell lists `t` or `toast` in its deps.

5. **"Add window" gives a day the server accepts (PAD-361, B-140).** Both shells call one
   function, `addWorkingWindow` (`@levelup/config`), so they cannot disagree. It reads the **whole
   day**, not the last row — the editors never sort their rows, only the server does on save — and
   answers the day sorted by start: (a) the new window takes the **largest free gap** inside the
   default day (08:00–22:00), before, between or after the existing windows, once an hour's break
   is kept from each window it would touch, provided an hour or more is left (the earliest gap wins
   a tie); (b) otherwise the **longest** window splits around a one-hour break — 13:00–14:00 when
   that sits inside it with an hour on each side, else its middle on the 15-minute grid — if it is
   three hours or longer; (c) otherwise the control is disabled. It is disabled too while the day
   is one rule 2 would refuse as it stands (a row that is not a time, `start >= end`, off the grid,
   overlapping): the coach fixes the row first. An untouched day becomes 08:00–13:00 and
   14:00–22:00; an evening-only day (20:00–22:00) gains 08:00–19:00. **Why this default:** a second
   window exists only to express a break (rule 2's lunch break), so the control hands the coach a
   break they can save as it is and then adjust; the break is also why a gap is never filled to
   its edges — a second tap would otherwise fill the lunch break the first one made. The first
   version appended `[last end, 22:00]`, which on an untouched day is the zero-length 22:00–22:00
   and was refused on save; the second read only the last row, so an early window typed last got
   08:00–22:00 laid over the rest of the day (Session-B's review of #347). Decided by Session D on
   the coordinator's instruction and ruling, 2026-09-21; the owner was not asked.
6. **The time controls stay on rule 2's grid (PAD-369, B-141).** On iOS and Android the editor's
   pickers offer minutes in steps of 15 (`TimePickerInput`'s `minuteInterval`, a prop that is
   unset everywhere else, so no other screen's picker changes). On web a typed time moves to the
   nearest quarter hour when the field loses focus (`snapToGrid`, `@levelup/config`; never past
   23:45), so the coach sees the value that will be saved — it is not corrected silently at save;
   on iOS and Android the editor snaps what the picker hands back as well. "Nearest" is **capped at
   23:45**: 23:53–23:59 move down, because the server accepts an end of 24:00 but neither editor can
   express it — a known limit, PAD-379 (B-142), not a rule. Snapping can leave a window with no
   length (23:45–23:59 → 23:45–23:45); that stays rule 2's refusal.
   `step` on a web time input is not protection: it drives the arrows only, and a typed value is
   neither stopped nor flagged. `start >= end` and overlapping windows are still possible between
   two fields and stay the server's refusal (rule 2).

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

#### A late load does not undo an edit (PAD-392)
- **Given** coach Ana opens Settings → Calendar and the week has loaded
- **When** she switches Sunday to "não trabalho" and, a moment later, the account's language settles (the component is handed a new `t`)
- **Then** Sunday still reads "não trabalho", and the week was fetched exactly once
- **Given** nothing was touched
- **Then** the editor shows what the server holds
#### Add window gives a day that saves (PAD-361)
- **Given** coach Ana has never saved working hours, so Monday shows the default 08:00–22:00
- **When** she taps "add window" on Monday and saves
- **Then** Monday holds `[["08:00","13:00"],["14:00","22:00"]]`, the save is accepted and the editor shows the success, on web and iOS alike
- **Given** a day whose only window is 20:00–22:00
- **Then** "add window" gives 08:00–19:00 beside it
- **Given** a day the server accepts whose rows are out of order — 08:00–13:00, 14:00–17:30, then 06:00–07:00 typed last
- **Then** "add window" gives 18:30–22:00 and the day still saves
- **Given** a day with no gap that leaves an hour and no window of three hours
- **Then** "add window" is disabled on that day

#### The time controls stay on the grid (PAD-369)
- **Given** coach Ana types 22:07 as Tuesday's end on web
- **When** the field loses focus and she saves
- **Then** the field reads 22:00, the save is accepted and Tuesday holds `[["08:00","22:00"]]`
- **Given** Ana turns the minute wheel of Monday's end on iOS
- **Then** every value it offers is a quarter hour, and the save is accepted
