# Summary — Calendário iOS design canvas (2026-09-08)

A Claude Design canvas with three 393px iPhone artboards — **Dia**, **Semana**, **Mês** —
showing a complete new visual style for the coach's mobile calendar. The owner's brief on
handover: "a complete new style on mobile calendar (both for mobile webapp and iOS)". The
canvas is built on the `levelup-design-system` tokens (`_ds/levelup-design-system-fec52606…`)
and is interactive: selecting a day updates the detail sheet, and the Semana/Mês bottom
sheets are drag-resizable.

Verbatim source: `source.html` (gitignored — schema §4.4). `extracted/screens.md` describes
every artboard element by element; `extracted/tokens.md` resolves each design token the
canvas uses to its light-theme value so the two shells can map them.

## What the design says

1. **Three view modes, one segmented control.** `Dia | Semana | Mês` sits directly under a
   navy screen header (app mark + "Calendário"). The active segment is a solid navy-800 pill
   with white text; idle segments are transparent with tertiary text. Today the product has
   only a week view on both shells (`calendar.view` rules 7 and 14).
2. **A persistent "selected day" detail block** on every mode: a 48px navy circle with the
   day number, the full weekday + date ("segunda-feira, 7 setembro"), and a count line
   ("2 aulas"), followed by the day's event cards. In Dia it is inline; in Semana and Mês it
   is a **draggable bottom sheet** (grab handle, 20px top radius, upward shadow) that slides
   over the time grid.
3. **Three card variants** in the detail list: `class` (solid `action-primary` blue, white
   title, time with a recurrence glyph ↻, a white progress bar plus tabular `filled/capacity`),
   `break` (white card, 1.5px dashed border, title + time), `alert` (solid `status-problem`
   red, title only).
4. **Week strip** (Dia and Semana): seven columns with an uppercase 2–3 letter weekday
   abbreviation and a date circle. Selected day: soft-accent column background, accent
   abbreviation, navy-800 filled circle. Today (unselected): 2px accent inset ring and accent
   number. Semana adds a `Hoje` pill button and a `‹ 7 – 13 set ›` range label above the
   strip; Dia has only `‹ ›` chevrons flanking the strip.
5. **Time grid** (Semana): hour labels 10→16 on both edges, seven columns with hour rules,
   events as small rounded blocks (2-line clamped title) positioned by start/end minutes, the
   selected column tinted soft-accent. Tapping a column selects that day. Mês reuses the same
   grid for the **selected day only** (one wide column).
6. **Month grid** (Mês): `‹ Setembro 2026 ›` nav, weekday header row, Monday-start cells
   with the same selected/today circle treatment, out-of-month days at 32% opacity and
   unselectable, and up to **three 5px dots** per cell coloured by variant (class = blue,
   break = tertiary grey, alert = red).
7. **Bottom tab bar** in the mock has seven items including `Definiç…` — this contradicts the
   recorded decision `2026-09-04-ios-tab-bar-and-theme` (Settings left the bar; six tabs).
   Treated as frame chrome, not a calendar requirement.

## What the design does NOT show (gaps to resolve before building)

- No **completed / needs-filling / now** treatments — every class card is the same solid blue
  with a full 6/6 bar. The current product colour-codes done / fill / full / next and ships a
  legend on both shells (`calendar.view` rules 6 and 13). The design-system `ClassBlock`
  component encodes five statuses (scheduled, needsFilling, now, done, event).
- No **coach colour** per class; blocks are all `action-primary`.
- No **level chip**, court, or participant avatars on cards.
- No player/student variant of the calendar (students see enrolled classes read-only).
- No calendar-block types beyond a generic `break` (product has break / holiday / off-work /
  personal / unavailable) and no definition of what `alert` (the red "VV" card) maps to.
- No tap target for opening event detail from a card, no empty-day state, no loading state,
  no English strings, no dark theme (iOS is light-only by decision; web has dark mode).
- Hour range is hard-coded 10–16; product days span wider.
