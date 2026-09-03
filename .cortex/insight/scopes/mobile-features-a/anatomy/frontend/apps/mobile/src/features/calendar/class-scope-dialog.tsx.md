---
path: frontend/apps/mobile/src/features/calendar/class-scope-dialog.tsx
extracted_at: 2026-09-03T14:12:16Z
extraction_level: 2
size_lines: 97
size_tokens: 841
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "e36235a9d932f9fcf90612592593a467662cb0b47493a71a69ead54f992572c8"
---

## Purpose

Confirmation dialog for editing or deleting a recurring class: lets the coach choose whether the action applies to just this occurrence (`"single"`) or to this and all future ones (`"future"`), via `ApplyScope`. Ports web's `ClassScopeDialog.tsx`; the same component serves both `mode: "delete"` and `mode: "edit"`, switching only its i18n copy keys (`calendar.scope.<mode>.*`).

## Connections

Uses:
- `@levelup/config` (frontend/packages/config/src/index.ts): `lightTheme`.
- `@/components/ui/alert-dialog`, `@/components/ui/text` (outside this scope).

Used by: none within this scope — invoked from a class-detail screen's edit/delete flow, alongside `edit-class-diff.ts` and `calendar/hooks.ts`'s `useEditClass`/`useRemoveClass`, outside this slice.
