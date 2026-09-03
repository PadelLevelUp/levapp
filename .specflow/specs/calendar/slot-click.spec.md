---
id: calendar.slot-click
status: implemented
depends_on: [calendar.view, classes.create]
implements: ../../specs-business/calendar/coach-views-and-manages-schedule.business.md
governed_by: []
---

# calendar.slot-click


### Intent
Coaches can click an empty calendar slot — or click and drag across a run of consecutive empty
slots — to create a new class, with the date/time pre-populated.

### Rules
1. Clicking empty slot opens `AddClassSheet` with pre-filled date and time
2. Only available for coaches (not players)
3. Uses `canManageClasses` permission check
4. Slot selection (PAD-106) is a **drag**, not a click: pressing the mouse on an empty half-hour
   slot anchors a selection, moving the mouse extends it, and releasing resolves it. A plain click
   is the zero-length case of that same gesture — there is no separate click code path
5. A selection spanning a single half-hour slot resolves exactly as rule 1 did: `AddClassSheet`
   opens with the date and that slot's start time, and the end time keeps its existing default
   (start + 90 min). Single-click behaviour is unchanged
6. A selection spanning two or more slots opens the same `AddClassSheet` with the date, the
   selection's start time, AND an end time equal to **the last covered slot's start + 30 minutes**.
   Dragging 10:00 → 10:30 therefore prefills 10:00–11:00, not 10:00–10:30
7. The selection is normalised: dragging upward (release above the anchor) yields the same range as
   dragging downward across the same slots — start is always the earlier time
8. The selection is locked to the day column the drag started in. Horizontal movement is ignored;
   a range never spans two days
9. While a selection is in progress the covered slots are highlighted so the coach sees the range
   before releasing
10. A drag that starts on an existing event does not begin a selection — the event's own
    click/drag-to-reschedule behaviour (calendar.view) wins. A selection may still be dragged
    *over* an occupied slot; overlap is surfaced afterwards by the existing non-blocking overlap
    warning in `AddClassSheet` (PAD-99) rather than blocking the gesture
11. Pressing `Escape` mid-drag cancels the selection outright: no modal opens and no highlight is
    left behind. Releasing the mouse **outside** the grid is not a cancel — the selection resolves
    using the last slot the pointer was over inside the origin column (an accidental overshoot must
    not throw the gesture away) — but it must clear the highlight and every drag listener, so no
    state dangles either way
12. Desktop only. The gesture is mouse-driven and lives in `CalendarGrid`, which is rendered solely
    in the non-mobile branch of `CalendarPage`; `MobileCalendarView` gains no touch or pointer
    handlers, so touch devices are unaffected

### Acceptance Criteria

#### Drag across consecutive slots prefills the range
- **Given** a coach on the desktop weekly calendar
- **When** they press the mouse on the 10:00 slot of a day, drag down to the 11:30 slot, and release
- **Then** `AddClassSheet` opens with that day's date, start time `10:00` and end time `12:00`

#### Dragging upward normalises the range
- **Given** a coach on the desktop weekly calendar
- **When** they press on the 11:30 slot and drag up to the 10:00 slot before releasing
- **Then** the sheet opens with start time `10:00` and end time `12:00` — identical to the downward drag

#### Single click is unchanged
- **Given** a coach on the desktop weekly calendar
- **When** they click a single empty slot without moving the mouse
- **Then** `AddClassSheet` opens with that day's date and that slot's start time
- **And** the end time is the pre-existing default (start + 90 min), not start + 30 min

#### Escape cancels an in-progress selection
- **Given** a coach who has pressed the mouse on a slot and dragged across two more
- **When** they press `Escape` before releasing
- **Then** no modal opens and the range highlight disappears

#### Releasing outside the grid still resolves, and leaves nothing behind
- **Given** a coach who has dragged from 08:00 down to 09:00 and then moved the pointer sideways
  off the grid entirely, level with the 09:00 slot
- **When** they release the mouse there
- **Then** the sheet opens with the last in-grid range (08:00–09:30)
- **And** no range highlight remains on the calendar
