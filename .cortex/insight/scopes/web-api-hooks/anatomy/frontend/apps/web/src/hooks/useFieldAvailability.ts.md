---
path: frontend/apps/web/src/hooks/useFieldAvailability.ts
extracted_at: 2026-09-03T14:14:29Z
extraction_level: 2
size_lines: 4
size_tokens: 20
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "ed451c24260a18511e2d7c8cd7e5ffea2548c166144d812028e792080cf2e0bf"
---

## Purpose

A thin re-export barrel: `import "@/api/client"` for the `initApi()` side effect, then `export { useFieldAvailability } from "@levelup/hooks"` — debounces (default 500ms) calls to `checkFieldAvailable` as a form field's value changes, returning `{ checking, error }` for live inline-validation UI. Same shape as `useAutoInviteEnabled.ts`.

## Connections

Uses:
- `frontend/apps/web/src/api/client.ts`: imported for its `initApi()` side effect, needed since the re-exported hook calls `checkFieldAvailable` (which goes through `getApi()`).
- `@levelup/hooks` (outside scope): re-exports `useFieldAvailability`.

Used by: no file within this scope.

Semantically related (not imports): `frontend/apps/web/src/api/fields.ts` — the underlying `checkFieldAvailable` function this hook debounces calls to; `frontend/apps/web/src/hooks/useAutoInviteEnabled.ts` — same barrel pattern.
