A recurring calendar item — class or block — that gets edited, deleted, or rescheduled always asks the coach whether the change applies to `'single'` (just this occurrence) or `'future'` (this and every future occurrence). The choice is modeled as one shared type, `ApplyScope`, exported once from `ClassScopeDialog.tsx` and re-imported (never redefined) by `ClassDetailSheet.tsx`, `EventDetailSheet.tsx`, and `RescheduleDialog.tsx` (type-only import). `ClassScopeDialog` is parameterized by `mode: 'delete' | 'edit'` so it drives both flows from one component. `DeleteClassDialog.tsx` implements the same idea with its own `DeleteScope` type but is dead code — nothing imports it; `ClassScopeDialog` supersedes it for delete confirmations too.

## Implemented by
`frontend/apps/web/src/components/calendar/ClassScopeDialog.tsx#ApplyScope`
`frontend/apps/web/src/components/calendar/ClassDetailSheet.tsx`
`frontend/apps/web/src/components/calendar/EventDetailSheet.tsx`
`frontend/apps/web/src/components/calendar/RescheduleDialog.tsx`
`frontend/apps/web/src/components/calendar/DeleteClassDialog.tsx`

## Related concepts
[[non-blocking-booking-warnings]]
