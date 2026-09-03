---
concept: single-occurrence-vs-series-scope
---

# Single-occurrence vs. series scope

A recurring calendar item — class or block — that gets edited, deleted, or rescheduled always asks the coach whether the change applies to `'single'` (just this occurrence) or `'future'` (this and every future occurrence). The choice is modeled as one shared type, `ApplyScope = 'single' | 'future'`, exported once from `frontend/apps/web/src/components/calendar/ClassScopeDialog.tsx` and re-imported (never redefined) by `ClassDetailSheet.tsx`, `EventDetailSheet.tsx`, and `RescheduleDialog.tsx` (type-only import). `ClassScopeDialog` itself is parameterized by `mode: 'delete' | 'edit'` so it drives both flows from one component. `DeleteClassDialog.tsx` implements the same pattern with its own `DeleteScope` type but is dead code — nothing imports it; `ClassScopeDialog` supersedes it for delete confirmations too.

## Members

- `element:frontend/apps/web/src/components/calendar/ClassScopeDialog.tsx#ApplyScope` — the shared type
- `frontend/apps/web/src/components/calendar/ClassDetailSheet.tsx` — edit and delete scope
- `frontend/apps/web/src/components/calendar/EventDetailSheet.tsx` — delete scope for blocks
- `frontend/apps/web/src/components/calendar/RescheduleDialog.tsx` — reschedule scope (type only)
- `frontend/apps/web/src/components/calendar/DeleteClassDialog.tsx` — superseded, unreferenced
