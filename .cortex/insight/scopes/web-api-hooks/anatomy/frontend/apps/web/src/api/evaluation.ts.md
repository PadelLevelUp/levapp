---
path: frontend/apps/web/src/api/evaluation.ts
extracted_at: 2026-09-03T14:14:29Z
extraction_level: 2
size_lines: 37
size_tokens: 306
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "e78747cab5cc66e570f4f8d0a4a3512b4dfd4ca761f3a19faab74b4fdcb5505a"
---

## Purpose

Player-evaluation surface: `getEvaluationCategories` (read), `postEvaluationEntry` (submit a scored entry), `addEvaluationCategories`/`deleteEvaluationCategory` (manage the category list itself). Each has a mock/real switch; mock writes `console.log` and return, mock read returns `mockEvaluationCategories`. Wraps `@levelup/api`'s `evaluationApi`.

## Connections

Uses:
- `frontend/apps/web/src/api/client.ts`: imported for its `initApi()` side effect.
- `frontend/apps/web/src/data/mockData.ts`: `mockEvaluationCategories` for the demo-mode read payload.
- `@levelup/api/src/resources/evaluation` (outside scope): `evaluationApi.getEvaluationCategories`/`postEvaluationEntry`/`addEvaluationCategories`/`deleteEvaluationCategory`.

Used by: no file within this scope (its consumer is the player-evaluation UI, outside `api/`/`hooks/`/`data/`).
