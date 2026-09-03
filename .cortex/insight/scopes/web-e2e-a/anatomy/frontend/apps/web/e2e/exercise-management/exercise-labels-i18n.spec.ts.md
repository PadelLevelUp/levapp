---
path: frontend/apps/web/e2e/exercise-management/exercise-labels-i18n.spec.ts
extracted_at: 2026-09-03T00:00:00Z
extraction_level: 2
size_lines: 72
size_tokens: 994
centrality: medium
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "941f8b62197ab9021c095189a8038fabbef8ab6b22b015e33d1f98692f0c0367"
---

## Purpose

PAD-53 regression coverage that exercise type/difficulty labels render via
i18n keys (`training.exerciseType.<code>` / `training.difficulty.<code>`)
rather than the raw English `label` field from `packages/types`. Checks
the list-page filter dropdowns, the New Exercise form's Selects (located
by their default-value text, since no label/select association exists in
the markup), and the created exercise card's badges, then asserts no raw
i18n key string ever leaks onto the page. Cleans up the exercise it
creates.

## Connections

- Uses:
  - `helpers/auth.ts`: `loginAsCoach`.
  - `helpers/navigation.ts`: `openExercises`.
- Used by: — (leaf spec file)
- Semantically related (not imports): `.specflow/specs/training/exercises.spec.md`;
  the `training.exerciseType.*`/`training.difficulty.*` key namespace
  originates in `packages/types` (outside this scope).
