---
path: frontend/apps/web/e2e/evaluation-tools/eval-categories.spec.ts
extracted_at: 2026-09-03T00:00:00Z
extraction_level: 2
size_lines: 53
size_tokens: 585
centrality: medium
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "542fc5c87172906541b8ce4399272f449796e362229e3202082498415357c950"
---

## Purpose

US-46/US-47 baseline coverage that evaluation categories are reachable
(either as a settings section or via a player's "Add Evaluation" flow) and
that a coach can submit an evaluation entry. Deliberately targets "E2E
Student Two" rather than "E2E Student" so its optional save side effect
can't make `evaluation-persist.spec.ts`'s "starts with zero evaluations"
assertion order-dependent.

## Connections

- Uses:
  - `helpers/auth.ts`: `loginAsCoach`.
- Used by: — (leaf spec file)
- Semantically related (not imports): `.specflow/specs/evaluations/categories.spec.md`;
  shares the evaluation-sheet surface with
  `evaluation-tools/evaluation-persist.spec.ts`, which the player split
  exists specifically to decouple from.
