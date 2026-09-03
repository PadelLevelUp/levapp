---
path: frontend/packages/hooks/src/useFieldAvailability.ts
extracted_at: 2026-09-03T13:58:26Z
extraction_level: 2
size_lines: 41
size_tokens: 291
centrality: medium
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "ac93d8d5fbc7a495295fc99e0e4874b4ec38de97c3834d1d699a839199b02ca8"
---

## Purpose

Debounces (default 500ms) calls to `checkFieldAvailable` as a form field's `value` changes, returning `{ checking, error }` for live inline-validation UI (e.g. "username taken"). Clears any pending timer on unmount/re-trigger via the `useRef` timer handle, and short-circuits to `checking: false, error: null` when the trimmed value is empty.

## Connections

Uses:
- `frontend/packages/api/src/resources/fields.ts` (via `@levelup/api/src/resources/fields`): `checkFieldAvailable`, the sole call this hook debounces.

Used by:
- `frontend/packages/hooks/src/index.ts`: re-exported by name.
