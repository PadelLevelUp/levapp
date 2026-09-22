A recurring Settings-page pattern, independently reimplemented three times rather than shared: a card holding a list of draft rows (local state, keyed by a synthetic `new-<timestamp>` id for unsaved rows), inline inputs per field, an add-row button, a per-row delete calling its own API endpoint immediately, drag-and-drop reordering via raw HTML5 drag events (no library), and one bulk "Save" button that validates all rows client-side before a single bulk-upsert API call. `CoachLevelsSection.tsx` additionally overloads row *position* with domain meaning (position 1 = highest level, consumed by the notification engine's level-matching). `SeasonsSection.tsx` drops drag-reordering but keeps the id-omission-for-new-rows convention (PAD-89) so the backend can tell create from update in the same bulk call.

## Implemented by
`frontend/apps/web/src/components/settings/CoachLevelsSection.tsx`
`frontend/apps/web/src/components/settings/EvaluationCategoriesSection.tsx`
`frontend/apps/web/src/components/settings/SeasonsSection.tsx`

## Related concepts
[[notification-engine-settings]]
