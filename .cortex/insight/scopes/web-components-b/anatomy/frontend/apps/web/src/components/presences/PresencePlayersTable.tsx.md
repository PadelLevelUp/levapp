---
path: frontend/apps/web/src/components/presences/PresencePlayersTable.tsx
extracted_at: 2026-09-03T14:17:06Z
extraction_level: 2
size_lines: 327
size_tokens: 2818
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "7bb00d9a4cea05917e9240a952e60b16e11d627007ddf76d393cdf6982c469d2"
---

## Purpose

A sortable, filterable, column-toggleable per-player attendance table (PAD-140) with client-side search, min-total/max-unjustified numeric filters, a column-visibility dropdown (name is pinned and can't be hidden), and CSV export. Its own comment states filtering/sorting are deliberately client-side: the endpoint returns one row per roster player, small enough that a round-trip per keystroke would be slower than filtering in place. Row clicks navigate to `/players/{playerId}/attendance` — the existing per-player history page — rather than duplicating that view inline.

## Connections

Uses: `@/components/ui/button`, `@/components/ui/checkbox`, `@/components/ui/dropdown-menu`, `@/components/ui/input`, `@/components/ui/label`, `@/components/ui/skeleton`; `@/lib/utils` (`cn`); `@/types` (`PresencePlayerStats`); `react-router-dom` (`useNavigate`).

Used by: a presences page (outside this scope), which supplies `players`/`loading`.

Semantically related (not imports): `presences/PresenceCharts.tsx` — both consume `PresencePlayerStats`/the same presences-page dataset, one as a table and the other as charts, but neither imports the other.
