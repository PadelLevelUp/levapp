---
path: frontend/apps/web/e2e/evaluation-tools/evaluation-persist.spec.ts
extracted_at: 2026-09-03T00:00:00Z
extraction_level: 2
size_lines: 51
size_tokens: 557
centrality: medium
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "6ad71ee6f8be6106649c6fe42e2049e8c44d131916231940b287751cb6f36180"
---

## Purpose

PAD-56 regression test that saving a player evaluation actually persists
it — the bug this guards against showed a false-success toast while
nothing saved, leaving the panel at "No evaluations yet." even after
reload. Adjusts the seeded "Forehand" category slider, saves, confirms the
sheet closes and the panel updates, then hard-reloads and re-asserts the
evaluation is still there.

## Connections

- Uses:
  - `helpers/auth.ts`: `loginAsCoach`.
- Used by: — (leaf spec file)
- Semantically related (not imports): `.specflow/specs/evaluations/entries.spec.md`;
  uses "E2E Student" (not "Two") as its dedicated zero-evaluations
  fixture, kept isolated from `evaluation-tools/eval-categories.spec.ts`
  by that player split.
