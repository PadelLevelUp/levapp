---
path: frontend/apps/web/src/pages/PresencesPage.tsx
extracted_at: 2026-09-03T14:15:37Z
extraction_level: 2
size_lines: 301
size_tokens: 2400
centrality: medium
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "54442599bf35743e6d09e015c136bf4289840d9e9fadbe920c4b71ac30bf57b4"
---

## Purpose

PAD-140 — "Presenças", the coach's attendance overview at `/presences`. Coach-only, composing four blocks over three endpoints: a week-scoped validation inbox (`getPendingValidation`/`validateClassPresences`/`unvalidateClass`), KPI tiles + a players table (roster-window stats), and three charts (roster stats + trend). The stats window (`getPresenceStats`/`getPresenceTrend`) and the validation week (`weekOffset` → `weekBounds(weekOffset)`) are deliberately independent state, so paging through validation weeks doesn't make the page's overall statistics jump around.

## Main players (notable exports beyond the default)

- `weekBounds(offset)` — Monday–Sunday date-range bounds `offset` weeks from today, computed in **UTC** deliberately (not local time): a code comment explains `start_datetime` is stored naive-UTC on the backend, so building week boundaries from a local `Date` would shift by the UTC offset and drop a late-evening Sunday class into the wrong week — the same class of bug PAD-33 and PAD-114 both had to chase down. Matches `dateRanges.ts`'s convention.
- `StatTile` — a small KPI-tile presentational component (icon, label, numeric value, loading skeleton, `data-testid`), used four times for the page's summary tiles.

## Connections

Uses: `@/api/presences` (`getPendingValidation`, `getPresenceStats`, `getPresenceTrend`, `unvalidateClass`, `validateClassPresences`, outside this scope), `@/api/players` (`getCoachPlayers`, outside this scope), `@/components/attendance/dateRanges` (`toIsoDate`, outside this scope), `@/components/layout/AppLayout`, `@/components/presences/{PresenceCharts,PresencePlayersTable,ValidateClassesDialog}`, `@/components/ui/skeleton` (all outside this scope), `@/hooks/use-toast` (outside this scope), `@/types` (outside this scope), external `lucide-react`, `react`, `react-i18next`.

Used by: `frontend/apps/web/src/App.tsx`, mounted at `/presences` behind `RoleRoute allowedRoles={["coach"]}`.
