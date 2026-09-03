---
path: frontend/apps/web/src/components/attendance/AttendanceHistoryList.tsx
extracted_at: 2026-09-03T14:16:49Z
extraction_level: 2
size_lines: 140
size_tokens: 1363
centrality: medium
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "a8cad0af7709e0f9c1a1a220e278f58694037e9317d907b30ab8791573d8227f"
---

## Purpose

PAD-114 list of attended classes below the attendance chart; each row is a `role="button"` that deep-links into the calendar (`/calendar?classId=...&date=...`) so it reopens on that class's week with its detail sheet already open. Genericized for PAD-141's reuse on the "Faltas" (absences) page: `testIdPrefix`, `titleKey`, `emptyKey`, `icon` and `renderBadge` all default to the original attendance-page behaviour byte-for-byte, so a second page can render the same list with its own test ids and a trailing justification badge without touching this component's markup.

## Connections

Uses: `frontend/apps/web/src/components/attendance/dateRanges.ts` — `parseIsoDate`, to render `session.date` as a UTC-pinned day label (avoids the off-by-one-day drift PAD-33 fixed in messaging timestamps).

Used by: no file within this scope imports `AttendanceHistoryList`; consumed by the attendance page and the PAD-141 absences page, both outside `web-components-a`.
