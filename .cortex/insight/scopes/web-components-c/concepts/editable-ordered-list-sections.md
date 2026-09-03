---
concept: editable-ordered-list-sections
---

A recurring Settings-page pattern, independently reimplemented three times rather than shared: a card holding a list of draft rows (local `useState`, keyed by a synthetic `new-<timestamp>` id for unsaved rows), inline `Input`s per field, an add-row button, a per-row delete calling its own API endpoint immediately, drag-and-drop reordering via raw HTML5 drag events (`draggable`/`onDragStart`/`onDragOver`/`onDragEnd`, no library), and one bulk "Save" button that validates all rows client-side before a single bulk-upsert API call. `CoachLevelsSection.tsx` additionally overloads row *position* with domain meaning (position 1 = highest level, consumed by the notification engine's level-matching). `SeasonsSection.tsx` drops drag-reordering (seasons have no inherent order) but keeps the id-omission-for-new-rows convention (PAD-89) so the backend can tell create from update in the same bulk call.

Member files: `CoachLevelsSection.tsx`, `EvaluationCategoriesSection.tsx`, `SeasonsSection.tsx` (all under `frontend/apps/web/src/components/settings/`).
