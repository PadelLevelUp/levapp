---
path: frontend/apps/web/e2e/schedule-calendar/slot-drag-select.spec.ts
extracted_at: 2026-09-03T14:18:15Z
extraction_level: 2
size_lines: 161
size_tokens: 1429
centrality: medium
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "60f10162dd40b455fbb3a793eb63ccc0508c799b5d9d9e8ed188dad850e60ca5"
---

## Purpose

PAD-106: click-and-drag slot selection on the desktop weekly calendar grid.
Drives `page.mouse` directly (down, several intermediate moves, up) instead of
Playwright's `dragTo()`, because the grid's selection logic needs the
intermediate mousemove stream, not a single jump. Covers: dragging down
prefills start/end time correctly (end = last covered slot + 30min); dragging
upward normalizes to the same range; a single click still opens the sheet with
the old +90min default; Escape mid-drag cancels the selection; releasing
outside the grid still resolves the last in-grid range with no leftover
highlight. All tests target the Wednesday column to stay clear of the seeded
"E2E Academy Class" (Monday 10:00).

## Connections

Uses:
- ../helpers/auth: `loginAsCoach`
- ../helpers/navigation: `openCalendar`

Used by: —

Semantically related (not imports): exercises the desktop CalendarGrid's
slot-selection interaction and the "add class" sheet it opens; spec:
calendar.slot-click (rules 4-12).
