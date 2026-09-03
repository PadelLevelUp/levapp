---
path: frontend/apps/web/src/components/settings/SeasonsSection.tsx
extracted_at: 2026-09-03T14:16:04Z
extraction_level: 2
size_lines: 256
size_tokens: 2045
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "65b73242cce1c085f52b99af213768361acdb160110744948c579a04377f56a8"
---

## Purpose

`SeasonsSection` lets a coach define named date-range seasons (name, start/end date). Same draft-row/bulk-save shape as `CoachLevelsSection`/`EvaluationCategoriesSection`, minus drag-reordering, plus date-range validation (`startDate <= endDate`). The save payload deliberately omits `id` for locally-added rows (PAD-89) so the backend can distinguish create-from-scratch from update-in-place in the same bulk upsert call.

## Connections

Uses:
- `@/api/seasons` (`getSeasons`, `addSeasons`, `deleteSeason`, `SeasonUpsert`): the CRUD layer.
- `@/config` (`USE_MOCK_DATA`): mock-mode save short-circuit.
- `@/components/ui/{card,button,input,separator}`, `@/hooks/use-toast`.
- `@/types` (`Season`).

Used by: not observed within this scope (Settings page).

Semantically related (not imports): the same editable-ordered-list pattern as `CoachLevelsSection` and `EvaluationCategoriesSection`, each a separate implementation rather than a shared abstraction.
