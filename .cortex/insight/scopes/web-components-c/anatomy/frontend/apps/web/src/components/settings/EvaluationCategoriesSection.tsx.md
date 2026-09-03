---
path: frontend/apps/web/src/components/settings/EvaluationCategoriesSection.tsx
extracted_at: 2026-09-03T14:16:04Z
extraction_level: 2
size_lines: 240
size_tokens: 2254
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "f5a2ed43ffb93ba195789e4d8374751a314829ad3cf3c54360cdb47e5310b3dc"
---

## Purpose

`EvaluationCategoriesSection` lets a coach define the custom scoring categories (name + min/max numeric scale) used when evaluating players. Structurally near-identical to `CoachLevelsSection` and `SeasonsSection`: draft rows in local state, drag-and-drop reordering, add/remove, and a bulk save that validates (non-empty name, `scaleMin < scaleMax`) before upserting.

## Connections

Uses:
- `@/api/evaluation` (`getEvaluationCategories`, `addEvaluationCategories`, `deleteEvaluationCategory`): the CRUD data layer.
- `@/config` (`USE_MOCK_DATA`): mock-mode save short-circuit.
- `@/components/ui/{card,button,input,separator}`, `@/hooks/use-toast`.
- `@/types` (`EvaluationCategory`).

Used by: not observed within this scope (Settings page).

Semantically related (not imports): shares its exact draft-row / drag-reorder / bulk-save shape with `CoachLevelsSection` and `SeasonsSection` — three independent implementations of the same "editable ordered list of scalar records" pattern rather than a shared component.
