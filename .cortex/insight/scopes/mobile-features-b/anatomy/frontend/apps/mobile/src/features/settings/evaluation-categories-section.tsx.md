---
path: frontend/apps/mobile/src/features/settings/evaluation-categories-section.tsx
extracted_at: 2026-09-03T14:12:18Z
extraction_level: 2
size_lines: 283
size_tokens: 2334
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "3decfdd2c887217e810b23d6cebaf0168a860a81dc8802a80ccf13e5d410f380"
---

## Purpose

`EvaluationCategoriesSection` is the evaluation-categories editor, mirroring web's `EvaluationCategoriesSection`. The doc comment records two deliberate differences from web: no drag-to-reorder, because `addEvaluationCategories` only ever POSTs `{name, scaleMin, scaleMax}` with no order field — web's own drag-to-reorder is never actually persisted server-side, so porting a control that does nothing would be worse than omitting it; and rows stack vertically (name+delete on one line, min/max below) instead of web's five-controls-on-one-grid-row layout, since that layout is what pushed the delete button off-screen at 390pt.

## Connections

Uses (external, not in this scope): `@levelup/api`'s `evaluationApi` (`getEvaluationCategories`, `deleteEvaluationCategory`, `addEvaluationCategories` bulk-upsert).

Used by: `frontend/apps/mobile/src/features/settings/preferences-section.tsx`: renders `<EvaluationCategoriesSection />` conditionally when `isCoach` is true (visible via direct import in that file; not captured as a resolved in-scope edge in this scope's L1 data).
