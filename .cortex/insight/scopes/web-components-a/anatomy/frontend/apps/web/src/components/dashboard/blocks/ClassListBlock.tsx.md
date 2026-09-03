---
path: frontend/apps/web/src/components/dashboard/blocks/ClassListBlock.tsx
extracted_at: 2026-09-03T14:16:49Z
extraction_level: 2
size_lines: 122
size_tokens: 1302
centrality: medium
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "06f2f980dbebb98296c6f69f814ddfccd8abde1e67d4b3593f1bf6d4762f5904"
---

## Purpose

Renders a `DashboardClassListBlock` (upcoming classes, needs-players, a student's upcoming lessons, or invites-to-confirm — distinguished by `block.id`) as a list of clickable rows, each with a colour spine, title, optional warning-styled "missing N" badge, date/time, and an `OccupancyBar` derived by parsing the backend's `rightLabel` string (e.g. "2/6") via `parseOccupancy`. PAD-77: the backend emits block/empty titles and the "Missing N" badge as English literals, so this component maps each stable `block.id`/count back to an i18n key (`LIST_TITLE_KEYS`, `LIST_EMPTY_KEYS`, the `badgeLabel` regex) and falls back to the raw backend string for anything unrecognized.

## Connections

Uses: none within this scope; imports `@/components/ui/card`, `@/components/ui/occupancy-bar` (`OccupancyBar`, `parseOccupancy`), `@/types` (`DashboardClassListBlock`, `DashboardIcon`), `lucide-react`, `react-i18next`, `react-router-dom` — all outside this scope.

Used by: `frontend/apps/web/src/components/dashboard/DashboardRenderer.tsx` — rendered for the `"class_list"` block type.
