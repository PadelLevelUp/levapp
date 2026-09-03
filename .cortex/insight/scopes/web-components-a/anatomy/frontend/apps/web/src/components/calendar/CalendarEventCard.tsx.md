---
path: frontend/apps/web/src/components/calendar/CalendarEventCard.tsx
extracted_at: 2026-09-03T14:16:49Z
extraction_level: 3
size_lines: 169
size_tokens: 1493
centrality: high
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "5de9abadfec97fa15ab30c1cc37e1f1256eaf5658cf65372f88a5e05405f57ef"
---

## Purpose

The single card rendered for every class/event/block on the calendar, shared by both the desktop week grid (`variant="block"`, via `CalendarGrid`) and the mobile day list (`variant="row"`, via `MobileCalendarView`). Resolves a class's *visual state* (`block` placeholder / `next` upcoming / `past` / plain `hex`-coloured) through `@levelup/config`'s `resolveEventState`, then derives all colour, border and text-ink decisions from that state plus the class's own coach-picked hex colour — never a fixed palette. Delegates the confirmed/awaiting/free fill visualisation to `ClassFillBar`.

## Main players

- `CalendarEventCard(props)` (lines 36–168) — critical. The whole component; no sub-functions, all logic lives in the render body as a sequence of small derived variables (`state`, `typeClass()`, `stateStyle`, `onColor`, `showFill`) computed before the JSX.
- `stateStyle` / `onColor` derivation (lines 65–95) — critical. The core "how does this state look" branch: `next` state draws the class colour as a border with a `readableInk`-blended text colour on a plain card background; `past` state fades the hex via `fadeColor` and forces a border because a 22%-opacity pale hue over a white card was nearly invisible (see Insights); the default (live, upcoming) branch fills solid with `contrastTextOn(hex)` deciding white-vs-ink text.
- `variant: 'block' | 'row'` (lines 33, 47) — supporting. `'block'` is the tight desktop week-grid card (10px-scale type); `'row'` is the full-width mobile list row, which used to silently inherit the grid's cramped type scale until this prop was introduced to size it independently.

## Insights

- The `past` state's border exists specifically because a 22%-faded hue over a white card computed to roughly 1.06:1 contrast against the grid lines — the block effectively disappeared instead of visibly receding, so a `1px solid hsl(var(--border))` was added to give it an edge without making it compete with live classes again. Removing that border on a "simplification" pass would silently reintroduce the bug.
- `compact` collapses to title-only rendering (drops the time line, and the fill bar unless `isRow`) whenever the card's rendered height is too short for its content — the height threshold is computed by the *caller* (`CalendarGrid`, `< 56px` or `group.length > 2`), not by this component, so `CalendarEventCard` itself has no size-measurement logic of its own.
- `isNext` is a prop, not something this card computes — "which class is next" is a property of the whole visible event set (see `CalendarGrid`'s `findNextEventId`), and passing it down avoids every card independently re-deriving the same answer.

## Connections

Uses: `frontend/apps/web/src/components/calendar/ClassFillBar.tsx` — renders it for the confirmed/awaiting/free bar whenever `showFill` is true; `@levelup/config` (`contrastTextOn`, `fadeColor`, `hasOpenSpots`, `readableInk`, `resolveEventState`, `EventVisualState`) — the shared colour/state logic also used by `CalendarGrid` and `MobileCalendarView`.

Used by: `frontend/apps/web/src/components/calendar/CalendarGrid.tsx` (desktop week grid, `variant="block"`, absolutely positioned per event), `frontend/apps/web/src/components/calendar/MobileCalendarView.tsx` (mobile day list, `variant="row"`).

## Query pointers

- If you need to change how a class's colour/state maps to on-screen styling, also read: `@levelup/config`'s `resolveEventState`/`contrastTextOn`/`readableInk`/`fadeColor` (the shared logic this file consumes) — changing the mapping here without checking those changes only half the picture.
- If you need to change the fill bar (confirmed/awaiting/free), read first: `frontend/apps/web/src/components/calendar/ClassFillBar.tsx`, then verify against both `variant`s here, since `showFill`'s "compact" gating differs between `block` and `row`.
