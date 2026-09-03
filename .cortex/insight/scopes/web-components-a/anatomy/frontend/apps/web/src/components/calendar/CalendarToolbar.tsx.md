---
path: frontend/apps/web/src/components/calendar/CalendarToolbar.tsx
extracted_at: 2026-09-03T14:16:49Z
extraction_level: 2
size_lines: 65
size_tokens: 603
centrality: medium
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "23f5174ddf5baf7dbf1d8b22c39661370c4fa4b08a0c6b6e79bab1a7ed6f1708"
---

## Purpose

The desktop calendar's top toolbar: Today / prev-week / next-week controls and the week label on the left, the `CalendarLegend` in the middle (wraps to its own line below `lg`), and Add Event / Add Class buttons on the right (each only rendered if its `onAddEvent`/`onAddClass` handler prop is supplied — so a read-only or student view of the calendar can omit them). Purely a layout/composition component; owns no state.

## Connections

Uses: `frontend/apps/web/src/components/calendar/CalendarLegend.tsx` — rendered between the date controls and the action buttons.

Used by: no file within this scope imports `CalendarToolbar`; paired with `CalendarGrid`/`CalendarHeader` by the desktop calendar page (outside `web-components-a`).
