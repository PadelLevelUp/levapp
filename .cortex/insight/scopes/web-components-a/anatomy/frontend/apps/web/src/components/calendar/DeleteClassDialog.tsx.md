---
path: frontend/apps/web/src/components/calendar/DeleteClassDialog.tsx
extracted_at: 2026-09-03T14:16:49Z
extraction_level: 2
size_lines: 78
size_tokens: 642
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "cf5be1f8f3c24fcf80182edc371f360361da8e3f8628ec7579382b89f2a85205"
---

## Purpose

A single-vs-future delete-scope confirmation dialog, structurally near-identical to `ClassScopeDialog.tsx` in `mode="delete"` (same icons, same layout, its own `DeleteScope` type instead of the shared `ApplyScope`). A repository-wide search finds no remaining import of this component anywhere in the frontend — `ClassDetailSheet.tsx` and `EventDetailSheet.tsx` both use `ClassScopeDialog` for their delete confirmations instead. This file appears to be dead code superseded by the generic `ClassScopeDialog`, left in place rather than removed.

## Connections

Uses: none within this scope; imports `@/components/ui/alert-dialog`, `@/components/ui/button`, `lucide-react`, `react-i18next` — all outside this scope.

Used by: no file anywhere in the frontend imports `DeleteClassDialog` (verified via repo-wide grep) — unreferenced.
