---
path: frontend/apps/web/src/components/calendar/ClassScopeDialog.tsx
extracted_at: 2026-09-03T14:16:49Z
extraction_level: 2
size_lines: 88
size_tokens: 710
centrality: medium
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "58c7c1df8aa97986042413ca715bdb1f544704902c1771e2ca0e896a87d360e1"
---

## Purpose

A generic "apply to this occurrence only, or this-and-future occurrences" confirmation dialog for a recurring class, parameterized by `mode: 'delete' | 'edit'` so one component drives both the delete-scope and edit-scope prompts (pulling `calendar.scope.${mode}.*` translation keys). Also acts as the confirmation step itself for a recurring delete/edit — there is no separate "are you sure" beyond picking single vs. future. Exports the shared `ApplyScope = 'single' | 'future'` type used across the calendar edit/delete/reschedule flows.

## Connections

Uses: none within this scope; imports `@/components/ui/alert-dialog`, `@/components/ui/button`, `lucide-react`, `react-i18next` — all outside this scope.

Used by: `frontend/apps/web/src/components/calendar/ClassDetailSheet.tsx` (two instances — `mode="edit"` and `mode="delete"`), `frontend/apps/web/src/components/calendar/EventDetailSheet.tsx` (`mode="delete"` for a recurring block), `frontend/apps/web/src/components/calendar/RescheduleDialog.tsx` (imports the `ApplyScope` type, not the component itself).
