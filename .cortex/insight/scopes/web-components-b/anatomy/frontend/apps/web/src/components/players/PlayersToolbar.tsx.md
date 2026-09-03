---
path: frontend/apps/web/src/components/players/PlayersToolbar.tsx
extracted_at: 2026-09-03T14:17:06Z
extraction_level: 2
size_lines: 69
size_tokens: 559
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "4a9a73e2d095fa083a5e1f2c19f2e84249baf69be990beccc8b41ec9ce88fa76"
---

## Purpose

The players list page's header: title, search input, sort dropdown (`SortOption` — name/level, asc/desc), and "Add Player" button. Purely presentational/controlled — all state (`search`, `sortOption`) lives in the parent and is passed down along with change callbacks.

## Connections

Uses: `@/components/ui/button`, `@/components/ui/input`, `@/components/ui/select`.

Used by: the players list page (outside this scope), which owns the filter/sort state this toolbar controls and presumably passes `onAddPlayer` through to `AddPlayerSheet.tsx` (in this scope).

Semantically related (not imports): `players/AddPlayerSheet.tsx` — this toolbar's "Add Player" button is the conventional trigger for that sheet, though the wiring itself lives in the parent page, outside this scope.
