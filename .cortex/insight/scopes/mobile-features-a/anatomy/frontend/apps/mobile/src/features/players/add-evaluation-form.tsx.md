---
path: frontend/apps/mobile/src/features/players/add-evaluation-form.tsx
extracted_at: 2026-09-03T14:12:16Z
extraction_level: 2
size_lines: 218
size_tokens: 1956
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "1f77d41e2ff4941510cff5253ddb0c135964a37bee23df7408195a2a801839cd"
---

## Purpose

Category-score entry dialog for a player evaluation — a −/value/+ stepper per category (no slider primitive exists in `components/ui`, mirroring the credits-stepper pattern from web's own `AddToStandingWaitingListDialog`). Mobile port of web's `AddEvaluationSheet.tsx`, but score-entry only: web bundles strengths/weaknesses editing into the same sheet, while mobile's `PlayerDetailScreen` already has a dedicated `StrengthsWeaknesses` card for that, so this form submits empty `strengths`/`weaknesses` arrays on every save. That's safe because the backend's `add_evaluation_entry_service` only ever ADDS new, deduped notes from those lists — it never replaces or clears existing ones.

## Connections

Uses:
- `./hooks` → `frontend/apps/mobile/src/features/players/hooks.ts` (OUTSIDE this scope, cross-scope edge): `useEvaluationCategories`, `usePostEvaluationEntry`.
- `@levelup/config` (frontend/packages/config/src/index.ts): `lightTheme`.
- `@levelup/types` (frontend/packages/types/src/index.ts): `PlayerEvaluation`.
- `@/components/ui/{dialog,button,skeleton,spinner,text,toast}`, `@/lib/utils` (outside this scope): `cn`.

Used by: none within this scope — rendered by the player-detail screen outside this slice, alongside `StrengthsWeaknesses.tsx`.
