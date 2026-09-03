---
path: frontend/apps/mobile/src/features/settings/seasons-section.tsx
extracted_at: 2026-09-03T14:12:18Z
extraction_level: 2
size_lines: 272
size_tokens: 2109
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "e0ddd7725886eebb5067553d6cb2f943f6d9fde939e594367b78376675087003"
---

## Purpose

`SeasonsSection` is the seasons editor for the Settings "Calendar" section, mirroring web's `SeasonsSection`. It's coach-only — every endpoint 403s for a player — but the gating happens upstream via `visibleSections()` in the Settings screen, not in this component itself. Dates use the shared `DatePickerInput` (native picker, same ""-when-unset ISO contract as web's `<input type="date">`) rather than free text. A PAD-89 comment documents the upsert contract: persisted rows carry their `id` so the backend updates in place, while locally-added rows have a synthetic `new-<timestamp>` id and must be POSTed WITHOUT an `id` field so the backend creates them fresh. Layout mirrors the pattern used across this scope's settings editors: web packs name + two dates + delete onto one grid row; here each row is a bordered block with name+delete on line 1 and the two dates stacked below, all `flex-1` so nothing has a fixed pixel width to overflow at 390pt.

## Connections

Uses: `frontend/apps/mobile/src/features/settings/settings-api.ts`: imports `addSeasons`, `deleteSeason`, `getSeasons`, and the `SeasonUpsert` type (visible via direct import; not captured as a resolved in-scope edge in this scope's L1 data).

Used by: no in-scope file imports this section (no in-edges in this scope's L1 data); presumably composed into the Settings screen's coach-only `"calendar"` section, per `settings-sections.ts`.
