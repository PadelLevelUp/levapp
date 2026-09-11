---
id: calendar.mobile-views
status: implemented
depends_on: [calendar.view, calendar.event-detail, calendar.blocks, classes.instances]
implements: ../../specs-business/calendar/coach-views-and-manages-schedule.business.md
governed_by: []
provenance:
  - derives_from: archive/documents/2026-09-08-mobile-calendar-design/extracted/screens.md
---

# calendar.mobile-views

### Intent
On a phone — the web app below 768px and the iOS app always — the calendar is a three-mode
screen (Dia, Semana, Mês) with one persistent "selected day" detail list, styled per the
2026-09-08 design canvas. Both shells render the same structure from the same shared state
and the same shared colour rules, so they differ only in platform primitives.

Decisions taken with the owner on 2026-09-08 while ingesting the canvas are folded into the
rules below; the canvas itself is the visual reference
(`.cortex/archive/documents/2026-09-08-mobile-calendar-design/extracted/screens.md`). Where the
canvas is silent (status treatments, coach colour, add controls, students) these rules decide.

### Entities
- **READS:** LessonInstance, Lesson (via `GET /api/app/calendar`), CalendarBlock, Presence (through `participantCount`)
- **WRITES:** Lesson.color (one-off remap of retired swatches — rule 6)

### Rules

#### Structure
1. **Three modes, one control.** Under the screen header, a segmented control offers `Dia`,
   `Semana`, `Mês` (`calendar.views.day / week / month`). The active segment is a solid
   navy pill (`sidebar` token family) with white text; idle segments are transparent with
   muted text. The mode is remembered on the device (web `localStorage`, iOS
   `expo-secure-store`, which is already a dependency — no new native module) and defaults
   to `Dia`. Persistence is injected by the shell; `useCalendar` only takes an initial mode
   and reports changes.
2. **One selected day.** All three modes share a single selected day and a single anchor
   date, both owned by `useCalendar` in `@levelup/hooks` (which stays platform-neutral —
   `calendar.view` rule 12). Initially the selected day is today. Paging a week or month
   re-selects today when the new range contains it, otherwise the range's first day.
3. **The selected-day detail block** appears in every mode: a 48px navy circle with the day
   number, the full weekday and date in the active language ("segunda-feira, 7 setembro" /
   "Monday, 7 September"), a count line using the existing `calendar.mobile.classCount_*`
   keys, and the day's event cards sorted by `startTime`. In `Dia` it is inline below the
   week strip. In `Semana` and `Mês` it is a **bottom sheet** over the time grid: a grab
   handle, 20px top radius, an upward shadow, drag-resizable between a minimum that shows
   the header only and a maximum that leaves one hour-row of grid visible (in `Mês` the
   travel is wider — rule 17), defaulting to roughly 40% of the grid height. Web resizes
   with pointer events; iOS with the gesture handler. The card list inside the sheet
   scrolls. **(PAD-286)** The grab handle is a 40×5 `primary` pill centred on a 28px row —
   not the `border` grey of the canvas, which read as a divider — and the whole area from
   that row through the day header is the drag surface, so the sheet is caught without
   aiming at the pill; the `calendar-sheet-handle` id stays on the handle row. The corners
   and the shadow are the same on both shells: 20px top corners and a shadow cast upward
   (`0 -10px 24px` of navy `#0B1524` at 14%). On iOS that means the shadow lives on the
   sheet's outer view and the corner clipping on an inner one, because a view that clips
   its children also clips its own shadow (B-065).
4. **Empty day.** A selected day with no events shows the existing
   `calendar.mobile.noClassesScheduled` line in place of the card list.

#### Colour and status
5. **The coach's colour identifies a class; the treatment carries its state.** Each class card
   and grid block resolves its surface from the coach-picked hex plus `resolveEventState`
   (`@levelup/config`, shared by both shells):
   - `future` (scheduled): solid coach colour, text via `contrastTextOn`.
   - `next` (the next upcoming class when the visible range contains today, same gate as
     `calendar.view`): white card with a 1.5px outline in the coach colour, title in the
     coach colour via `readableInk`.
   - `past` (completed): coach colour faded via `fadeColor`, muted text.
   - `canceled`: solid `destructive` red surface, white title, the existing
     `calendar.eventCard.canceled` label as subtitle. Red means canceled and nothing else.
   - `block` (any `CalendarBlock` type): card surface with a 1.5px dashed `border`, title in
     foreground, the block type as subtitle. In the time grid a block is a `muted` surface.
   A class without a colour falls back to `primary`, exactly as today.
6. **Swatches never read as a status.** The eight coach-pickable colours live in exactly one
   place, `CLASS_COLOR_SWATCHES` in `@levelup/config`, and every picker (web add and detail
   sheets, iOS new and detail class screens) renders that list. The set contains no amber,
   red or green hue, so no class can be mistaken for "needs seats", "canceled" or "done":
   blue `#1355DC`, sky `#0EA5E9`, cyan `#0891B2`, teal `#0D9488`, indigo `#6366F1`, violet
   `#8B5CF6`, plum `#A21CAF`, slate `#475569`. The four retired swatches are remapped once by
   an idempotent Alembic data migration on every stored class colour: red `#ef4444` → plum,
   orange `#f97316` → cyan, yellow `#eab308` → teal, green `#22c55e` → teal. Colours outside
   both lists (legacy free-form values) are left untouched.
7. **Empty seats.** On a `future` or `next` class whose `participantCount` is below
   `maxPlayers`, the fill bar and the `X/Y` count render in `warning` amber; the card surface
   stays the coach colour. When full they are white on a coloured surface and `primary` on an
   outlined one. `past` and `canceled` cards never show amber. `X` remains the effective
   filled-spots value from `calendar.view` rules 8–10.
8. **Recurring events** show the `↻` glyph after the time range, with an accessibility label
   `calendar.eventCard.recurring`.
9. **No legend at phone widths.** The status treatments above are self-describing, so the
   legend row is not rendered below 768px on web and not at all on iOS. Desktop web keeps
   `CalendarLegend`. This supersedes `calendar.view` rule 13 on phones.

#### Dia
10. **Week strip.** Seven columns between `‹` and `›` chevrons (`calendar.toolbar.previousWeek
    / nextWeek`). Each column shows an uppercase locale weekday abbreviation, a date circle,
    and a dot row. States: selected → soft-accent column background (`secondary`), accent
    abbreviation, navy circle with a white number; today when not selected → transparent
    circle, `primary` number, 2px `primary` inset ring; otherwise transparent circle,
    foreground number. The dot row shows up to three 5px dots, one per event in `startTime`
    order, coloured by rule 5's surface (coach colour, `muted` for a block, `destructive`
    for a canceled class); a day with more than three events still shows three. Tapping a
    column selects that day. The strip never renders title chips or a `+N` indicator —
    this supersedes `calendar.view` rule 14's strip on iOS and web's 4-chip strip.

#### Semana
11. **Nav row.** A `Hoje` pill button (`calendar.toolbar.today`) on the left, then `‹`, the
    locale week-range label from `useCalendar` (`calendar.view` rule 12), and `›`.
12. **Day header row.** Seven columns with the abbreviation and a 26px date circle using
    rule 10's states, over 26px gutters that align with the hour labels.
13. **Time grid.** Hour labels on both gutters. The visible range runs from one hour before
    the earliest `startTime` in the visible week to one hour after the latest `endTime`,
    rounded to whole hours and clamped to 07:00–23:00; a week with no events shows
    08:00–20:00. Rows are equal height and the grid scrolls vertically when taller than the
    space above the sheet. Each event is an absolutely positioned block: top and height from
    its start and end minutes (minimum height 18px), 6px radius, surface per rule 5, title
    clamped to two lines. Overlapping events in one column share the width side by side
    (reuse `calendar-overlap.ts`). The selected day's column is tinted `secondary`.
14. **Tapping** a column's empty area selects that day. Tapping an event block opens its
    detail exactly as tapping its card does today (class → class detail; block → event
    detail).

#### Mês
15. **Month nav.** `‹`, the month and year in the active language ("Setembro 2026" /
    "September 2026"), `›`. Paging the month applies rule 2 to the selected day and refetches
    the six-week range that covers the grid.
16. **Month grid.** A weekday header row, then Monday-start cells for every week that touches
    the month. In-month cells show a 26px date circle using rule 10's states and the dot row
    from rule 10; out-of-month cells render at 32% opacity and are not tappable.
17. **Single-day grid and sheet.** Below the month grid, rule 13's time grid for the selected
    day only (one full-width column) with rule 3's bottom sheet over it. Its hour range applies rule 13 to the
    selected day's events alone (08:00–20:00 when that day is empty), so a quiet day is not
    squeezed by a busy one elsewhere in the month. **(PAD-286)** The sheet's travel spans
    the month grid as well as the single-day grid: at rest it sits at rule 3's default
    height over the day grid, and dragged up it stops one hour-row below the top of the
    month grid, so on a phone it covers more than half of the screen; the month grid is
    under it until it is dragged back down. Rule 18's "raised" test is unchanged — raised
    still means above the resting height.

#### Controls, roles, chrome
18. **Add controls are floating action buttons on both shells:** `Add event`
    (`calendar-add-event`, all roles) and `Add class` (`calendar-add-class`, coaches only),
    positioned as the iOS calendar already positions them. At phone widths web no longer
    renders `CalendarToolbar`; desktop web is unchanged. **(PAD-248)** Every list the buttons float
    over — the Dia card list and the Semana / Mês day sheet — ends with bottom padding taller
    than the button stack, so the last card can always be scrolled clear of the buttons on both
    shells. **(PAD-248, coordinator decision 2026-09-10)** In `Mês` the month grid leaves
    the day sheet too little list for that padding, so while the sheet is dragged above its
    resting height the two floating add buttons are hidden on both shells; they come back as
    soon as the sheet is at or below its resting height, and on leaving `Mês`. `Dia` and
    `Semana` always show them.
19. **Students** see the same three modes, read-only: their enrolled classes and their own
    blockers, with no `Add class` button. Everything else in this spec applies.
20. **Screen header.** iOS keeps its navy tab header with the mark and `nav.calendar`. Web
    keeps its existing phone app bar (white, mark only) — **decided 2026-09-08**: the canvas's
    navy web header is not adopted. The calendar screen on web starts at the segmented
    control.
21. **Desktop web is untouched.** At 768px and above the calendar page renders exactly what it
    renders today (`CalendarToolbar` + `CalendarHeader` + `CalendarGrid`, legend included).
22. **Web dark theme** follows the shared tokens: the navy elements use the `sidebar` family,
    which is navy in both themes; every other surface uses its theme token. iOS stays light
    (decision 2026-09-04).

#### Compatibility
23. **Stable test ids are preserved** so existing Playwright specs and the Maestro
    `goto-seeded-monday` subflow keep working: web `day-fill-dot`, `calendar-event-card`,
    `mobile-bottom-nav`; iOS `screen-calendar`, `calendar-today`, `calendar-prev-week`,
    `calendar-next-week`, `calendar-day-{yyyy-MM-dd}`, `calendar-event-{id}`,
    `calendar-event-fill-{id}`, `calendar-add-event`, `calendar-add-class`, `class-fill-bar`.
    `calendar-today` moves to the `Semana` nav row (rule 11) because `Dia` has no `Hoje`
    button in the design; the Maestro `goto-seeded-monday` subflow does not use it. Web's
    selected-day label stays an `<h3>` (the `i18n-date-locale` spec reads it) and the strip
    dots keep `data-testid="day-fill-dot"` with `data-event-title` (the `mobile-weekly-order`
    spec reads them in order). New: `calendar-view-day / -week / -month` on the segments,
    `calendar-sheet-handle`, `calendar-grid-column-{yyyy-MM-dd}`,
    `calendar-month-cell-{yyyy-MM-dd}`.
24. **Cards are buttons.** Every event card and grid block is a real button (closes PAD-148's
    calendar half). On web the accessible name is `title, time range`. On iOS the name is the
    bare title and the time range is the accessibility hint — Maestro's `goto-seeded-monday`
    subflow (rule 23) finds a class by its exact title.
25. **i18n** adds keys only to the existing `calendar` namespace, in both `pt` and `en`, so
    the mobile static-import trap (R-024) cannot bite.

### Acceptance Criteria

#### Segmented control switches modes and remembers the choice
- **Given** a coach on the web calendar at a 390×844 viewport, mode `Dia`
- **When** they tap `Semana`
- **Then** the time grid and the bottom sheet render and the `Semana` segment is the navy pill
- **And** after a reload the calendar opens in `Semana`

#### Selected day is shared across modes
- **Given** the coach selects Wednesday in `Dia`
- **When** they switch to `Mês`
- **Then** the Wednesday cell is selected and the sheet header reads Wednesday's date and count

#### Coach colour identifies, state treats
- **Given** a scheduled class with colour `#0D9488` on the selected day, and the same class
  completed yesterday
- **When** the coach opens `Dia` for each day
- **Then** today's card has a solid `#0D9488` surface with white text
- **And** yesterday's card has the faded `#0D9488` surface with muted text

#### Next class is outlined, not filled
- **Given** the visible week contains today and the next upcoming class has colour `#6366F1`
- **When** the coach views its card
- **Then** the card surface is the card colour with a 1.5px `#6366F1` outline and the title
  in the readable-ink mix of `#6366F1`

#### Canceled is red and only red is canceled
- **Given** a canceled occurrence on the selected day
- **When** the coach views `Dia`
- **Then** its card has the `destructive` surface and the "Cancelada" subtitle
- **And** no non-canceled card on any day uses that surface

#### Empty seats go amber on the bar, not on the card
- **Given** a scheduled class `3/6` with colour `#1355DC`
- **When** the coach views its card
- **Then** the surface is `#1355DC`, and the fill bar and the `3/6` count are `warning` amber
- **And** a `6/6` class next to it shows a white bar and count

#### The picker offers only the shared swatches
- **Given** the coach opens Add class on web and on iOS
- **When** they view the colour picker
- **Then** exactly the eight `CLASS_COLOR_SWATCHES` render, in the same order, on both shells
- **And** none of `#ef4444`, `#f97316`, `#eab308`, `#22c55e` is offered

#### Retired colours are remapped once
- **Given** stored classes with colours `#ef4444`, `#f97316`, `#eab308`, `#22c55e`, `#0ea5e9`
  and `#123456`
- **When** the migration runs, then runs again
- **Then** they read `#A21CAF`, `#0891B2`, `#0D9488`, `#0D9488`, `#0ea5e9` and `#123456`
- **And** the second run changes nothing

#### Dia strip shows dots, never chips
- **Given** a day with four events: two classes (`#0EA5E9`, `#8B5CF6`), one block, one canceled
- **When** the coach views the week strip
- **Then** that column shows three dots coloured `#0EA5E9`, `#8B5CF6` and `muted`, in
  `startTime` order, and no title chip or `+N`

#### Week time grid positions events by minutes
- **Given** `Semana` with a class 10:00–11:30 on Tuesday and nothing earlier than 09:00 or later
  than 18:00 in the week
- **When** the grid renders
- **Then** hour labels run 08 to 19, and the class block starts at the 10:00 row with a height
  of 1.5 rows
- **And** tapping the empty area of the Tuesday column selects Tuesday and tints the column

#### Empty week shows the default range
- **Given** a week with no events
- **When** `Semana` renders
- **Then** hour labels run 08 to 20

#### Bottom sheet resizes within bounds
- **Given** `Semana` with the sheet at its default position
- **When** the coach drags the handle up past the maximum
- **Then** the sheet stops at the maximum and at least one hour row of the grid stays visible
- **And** dragging it down past the minimum leaves the sheet header visible

#### The grab handle is obvious and easy to catch
- **Given** `Semana` at 390×844 on web and on iOS
- **When** the sheet renders
- **Then** the handle row is at least 28px tall and its pill is 40×5 in the `primary` colour
- **And** a drag that starts on the day header moves the sheet exactly as a drag on the pill
  does

#### The Mês sheet rises past half of the screen
- **Given** `Mês` at 390×844 on web and on iOS with the sheet at its resting height
- **When** the coach drags the handle up past the maximum
- **Then** the sheet stops with its top one hour-row below the top of the month grid, and its
  height is more than half of the viewport
- **And** dragging it back down to its lowest position uncovers the month grid and the add
  buttons return (rule 18)

#### The iOS sheet has the web sheet's corners and shadow
- **Given** `Semana` on iOS
- **When** the sheet renders over the grid
- **Then** its top corners are rounded by 20pt and a shadow is visible above its top edge, as
  on web (B-065)

#### Month grid dims other months and marks days
- **Given** `Mês` on September 2026 (starts on a Tuesday)
- **When** the grid renders
- **Then** Monday 31 August renders at 32% opacity and does not respond to a tap
- **And** each September day with events shows up to three dots
- **And** tapping 10 September selects it, shows its single-day grid and its sheet

#### Month paging refetches and reselects
- **Given** `Mês` on September 2026 with 10 September selected, today being 8 September
- **When** the coach taps `›`
- **Then** the grid shows October 2026, 1 October is selected, and the events for the six-week
  range covering October were requested

#### Legend is gone on phones and kept on desktop
- **Given** the web calendar at 390px wide and at 1280px wide, and the iOS calendar
- **When** each renders
- **Then** `calendar-legend` is absent at 390px and on iOS, and present at 1280px

#### FABs on both shells
- **Given** a coach at phone width on web and on iOS
- **When** the calendar renders in any mode
- **Then** `calendar-add-event` and `calendar-add-class` float over the content and the toolbar
  is absent
- **And** a student sees `calendar-add-event` only

#### Floating add buttons never hide the last card
- **Given** a coach whose selected day has six classes, at 390×844 on web and on iOS
- **When** they scroll the Dia list, and then the Semana and Mês day sheets, to their end
- **Then** the last card ends above the top of both `calendar-add-event` and
  `calendar-add-class`

#### Add buttons step aside while the Mês sheet is pulled up
- **Given** a coach in `Mês` at 390×844 with the day sheet at its resting height
- **Then** `calendar-add-event` and `calendar-add-class` are visible
- **When** they drag the sheet above its resting height
- **Then** both buttons are gone
- **And** dragging the sheet back down to its lowest position brings both back
- **And** in `Semana`, dragging the sheet up leaves both buttons visible

#### Labels follow the language
- **Given** a coach whose language is `pt`, then `en`
- **When** they view `Mês` on September 2026 with Monday 7 selected
- **Then** the month reads "Setembro 2026" then "September 2026", the sheet header reads
  "segunda-feira, 7 setembro" then "Monday, 7 September", and the segments read
  "Dia / Semana / Mês" then "Day / Week / Month"

#### Existing navigation ids still work
- **Given** the Maestro subflow `goto-seeded-monday`
- **When** it runs against the new iOS calendar in `Dia`
- **Then** `calendar-next-week`, `calendar-day-{date}` and `calendar-event-{id}` resolve and the
  seeded class opens

### Notes
- **Status (2026-09-10, PAD-248):** every rule (1–25) is built on web and iOS — Dia
  (PAD-246), Semana (PAD-247) and Mês with the FAB clearance (PAD-248). Verified by the full
  Playwright suite (422 tests, run as four shards: 420 passed, 2 skipped, 0 failed) and the
  Maestro flows `31-week-view` and `32-month-view` on the simulator.
- Ships in three tickets, each landing web and iOS together (R-024): (1) Dia, shared chrome,
  colour rules and the swatch remap; (2) Semana; (3) Mês. Until ticket 3 lands, the
  segmented control offers only the shipped modes.
- Everything is fed by the existing `GET /api/app/calendar?from&to`; `Mês` widens the range
  to the six visible weeks. No new endpoint.
- The design-system `ClassBlock` (five statuses, amber surface for "needs filling") was
  considered and not adopted: the owner chose the coach colour as the surface with amber on
  the bar only.
- The canvas's seven-item tab bar is frame chrome; the product bar is six items (decision
  2026-09-04).
- **PAD-286 (2026-09-11, founders' notes):** the handle becomes a `primary` pill on a 28px
  row with the day header as part of the drag surface, the `Mês` sheet travels over the month
  grid, and the iOS sheet gets the corners and shadow rule 3 always asked for (B-065).
- OPEN: none.
