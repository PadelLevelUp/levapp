---
path: frontend/apps/mobile/src/features/calendar/edit-class-diff.ts
extracted_at: 2026-09-03T14:12:16Z
extraction_level: 2
size_lines: 55
size_tokens: 507
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "2db99918320dd8bd5e04fbbb7eeceda5f0814e74eb45aba06705d1045bd4b323"
---

## Purpose

Pure diff helpers feeding the edit-class payload. `EDITABLE_CLASS_FIELDS` lists exactly the `ClassInstance` keys the edit UI may change (mirrors web's `EDITABLE_FIELDS` in `ClassDetailSheet.tsx`). `diffInstance<T extends object>` compares `original`/`updated` field-by-field via `JSON.stringify`, so nested fields like `recurrenceRule` are caught, and returns only the changed subset for `useEditClass`'s `updates` payload. `diffParticipants` reduces two participant id lists to `{ addPlayers, removePlayers }` id-set diffs. Both directly port web's `ClassDetailSheet.tsx` diff logic. `diffInstance` is generically constrained to `object` rather than `Record<string, unknown>` deliberately: `keyof T` indexing works on any object type without an index signature, so the looser `Record` constraint was unnecessary and would have forced a cast at every call site for plain interfaces like `ClassInstance`.

## Connections

Uses:
- `@levelup/types` (frontend/packages/types/src/index.ts): `ClassInstance`.

Used by: none within this scope — consumed by the class-detail screen's edit flow together with `calendar/hooks.ts`'s `useEditClass`, outside this slice.
