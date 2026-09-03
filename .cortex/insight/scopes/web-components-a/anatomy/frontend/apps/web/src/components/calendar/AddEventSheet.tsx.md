---
path: frontend/apps/web/src/components/calendar/AddEventSheet.tsx
extracted_at: 2026-09-03T14:16:49Z
extraction_level: 2
size_lines: 260
size_tokens: 2537
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "5e5c2661a767ec4ef0d3fce92ee721b338189d928a570c2b92b9b3bc929bb2df"
---

## Purpose

The "create calendar event" side sheet (as opposed to a class) — a lighter-weight sibling of `AddClassSheet.tsx` for non-lesson blocks: personal, break, holiday, off-work. Collects type, title, description, date/time and optional weekly recurrence, then calls `onSave` with the assembled payload. No overlap/unavailability/rejection handling — those are `AddClassSheet`-only concerns for actual lessons; this sheet only validates required fields (date, and days/end-date when recurring) before saving.

## Connections

Uses: none within this scope; imports `@/components/ui/*` primitives, `@/hooks/use-toast`, `@/types` (`CalendarBlockType`), `date-fns`, `lucide-react`, `react-i18next` — all outside this scope.

Used by: no file within this scope imports `AddEventSheet`; opened from the calendar page (outside `web-components-a`), as the "Add event" counterpart to `AddClassSheet`'s "Add class".
