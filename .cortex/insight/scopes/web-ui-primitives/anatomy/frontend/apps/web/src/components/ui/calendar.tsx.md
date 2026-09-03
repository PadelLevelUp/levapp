---
path: frontend/apps/web/src/components/ui/calendar.tsx
extracted_at: 2026-09-03T14:21:27Z
extraction_level: 2
size_lines: 55
size_tokens: 640
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "845a0b0fdec33d8d49ab8ed05dd29a12c10b5bbcf60f24d0b9fc0a731ab18621"
---

## Purpose

Date-picker grid wrapping `react-day-picker`'s `DayPicker`. Maps DayPicker's internal class-name slots (`nav_button`, `day`, `day_selected`, `day_today`, etc.) onto `buttonVariants`/Tailwind theme tokens so navigation buttons and day cells render with the same visual system as the rest of the app; swaps DayPicker's default chevrons for `lucide-react` icons.

## Connections

Uses:
- `@/lib/utils`: `cn()` for class merging.
- `@/components/ui/button`: `buttonVariants` — styles `nav_button` (outline variant) and `day` (ghost variant) slots.
- `lucide-react`: `ChevronLeft`/`ChevronRight`, replacing DayPicker's default nav icons.
- `react`: component typing only.
- `react-day-picker`: `DayPicker`, the underlying calendar implementation.

Used by:
- Not resolved in this slice — `edges_crossing_scope` is empty for `web-ui-primitives` in the extraction scope file, so no consuming feature files were provided.
