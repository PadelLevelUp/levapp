---
path: frontend/packages/api/src/resources/evaluation.ts
extracted_at: 2026-09-03T13:58:26Z
extraction_level: 2
size_lines: 20
size_tokens: 197
centrality: medium
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "1aa724bc959240f1a5dfe9c70700d93abc923fe33d84e58c2f59b144ef0f5a1f"
---

## Purpose

Player skill evaluation: fetch categories, submit a scored entry, and coach-side category management — bulk `addEvaluationCategories` and `deleteEvaluationCategory` (the latter following the `POST /app/delete/<resource>` non-RESTful convention also seen in `coachLevel.ts`).

## Connections

Uses:
- `frontend/packages/api/src/client.ts`: `getApi()` for `/app/evaluation_categories`, `/app/add_evaluation_entry`, `/app/add_evaluation_categories`, `/app/delete/evaluation_category`.
- `frontend/packages/types/src/domain.ts` (via `@levelup/types`): `EvaluationCategory`, `EvaluationEntryPayload`.

Used by:
- `frontend/packages/api/src/index.ts`: re-exported as `evaluationApi`.
