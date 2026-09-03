---
path: frontend/apps/web/src/components/calendar/RescheduleDialog.tsx
extracted_at: 2026-09-03T14:16:49Z
extraction_level: 2
size_lines: 94
size_tokens: 794
centrality: medium
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "72c5e1876bef1c0b35fa5a5a9c8f56934379d2551153175a028d8f243603469c"
---

## Purpose

Confirmation dialog shown after a drag-and-drop reschedule on `CalendarGrid` (or a future drag-drop surface): states the new date/time and, for a recurring event, offers the same single-vs-future scope choice as `ClassScopeDialog` (reusing its `ApplyScope` type rather than duplicating it) via its own two big-button layout; for a non-recurring event it collapses to one plain "Reschedule" button.

## Connections

Uses: `frontend/apps/web/src/components/calendar/ClassScopeDialog.tsx` — imports only its exported `ApplyScope` type (`import type { ApplyScope } from './ClassScopeDialog'`), not the component itself.

Used by: no file within this scope imports `RescheduleDialog` (no in-scope or crossing edge recorded); presumably wired up by the calendar page around `CalendarGrid`'s `onEventDrop`, outside `web-components-a`.
