---
path: frontend/packages/config/src/presence-status.test.ts
extracted_at: 2026-09-03T13:58:26Z
extraction_level: 2
size_lines: 101
size_tokens: 774
centrality: medium
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "382906395364c0660c57bb582291b177bff934a3a54fcb31ef8f5d79abc127e3"
---

## Purpose

Unit tests for `presence-status.ts`: round-trips every mark through `fromMark`/`toMark`, pins the "absence with no justification defaults to unjustified" rule, tests `prefillMark`'s policy defaults (`declined` → justified, `confirmed` → present, `none` → undecided), `effectiveMark`'s precedence chain (coach edit > stored > prefill), and `undecidedCount`.

## Connections

Uses:
- `frontend/packages/config/src/presence-status.ts`: `effectiveMark`, `fromMark`, `prefillMark`, `toMark`, `undecidedCount` under test.
- `frontend/packages/types/src/domain.ts` (via `@levelup/types`): `PendingValidationPlayer` type for the local `player()` test-fixture factory.

Used by: none (leaf test file).
