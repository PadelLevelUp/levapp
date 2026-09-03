---
path: frontend/packages/config/src/tokens.test.ts
extracted_at: 2026-09-03T13:58:26Z
extraction_level: 2
size_lines: 213
size_tokens: 1996
centrality: medium
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "7eb6acbe48c78ea69b1d90587d0ae1de3f7bbb66c022361611ca881ff11216ed"
---

## Purpose

Pins design-token invariants (brand primary hex, HSL triplet/`hsl(...)` string formats via regex, dark-theme text-on-primary contrast, etc.) AND reads `apps/web/src/index.css` (outside this scope, located via `fileURLToPath`/`import.meta.url`) to cross-check that every `SEMANTIC_COLORS` token defined in `tokens.ts` is actually mirrored there — this is the enforcement mechanism for the "both files must be hand-kept in sync" rule documented in `tokens.ts`'s header comment.

## Connections

Uses:
- `frontend/packages/config/src/tokens.ts`: `radius`, `lightThemeHsl`, `darkThemeHsl`, `lightTheme`, `darkTheme`, `nativewindTheme`, `ThemeHsl` under test.

Used by: none (leaf test file).

Semantically related (not imports): `apps/web/src/index.css` (outside this scope) — read directly at test time via a filesystem path, not imported as a module; this is the file whose hand-mirrored token values this test verifies against.
