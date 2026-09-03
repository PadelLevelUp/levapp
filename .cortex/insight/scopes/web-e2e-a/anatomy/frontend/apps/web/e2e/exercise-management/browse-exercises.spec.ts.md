---
path: frontend/apps/web/e2e/exercise-management/browse-exercises.spec.ts
extracted_at: 2026-09-03T00:00:00Z
extraction_level: 2
size_lines: 41
size_tokens: 443
centrality: medium
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "a133a444557cf1acbc9d3d83e6365aa09cdba3449d2cafd499fff66fbbed341b"
---

## Purpose

US-17 baseline coverage that the exercises library page renders its
search box, type filter and difficulty filter, and that typing an
unmatched search string filters the list down — asserted by the absence of
any match rather than an exact remaining count, since this file doesn't
fix the seed's total exercise count.

## Connections

- Uses:
  - `helpers/auth.ts`: `loginAsCoach`.
  - `helpers/navigation.ts`: `openExercises`.
- Used by: — (leaf spec file)
- Semantically related (not imports): `.specflow/specs/training/exercises.spec.md`;
  shares the debounced-search pattern with
  `exercise-management/exercise-labels-i18n.spec.ts`.
