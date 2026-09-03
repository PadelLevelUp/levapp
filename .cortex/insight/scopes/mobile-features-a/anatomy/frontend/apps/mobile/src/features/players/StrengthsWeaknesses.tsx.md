---
path: frontend/apps/mobile/src/features/players/StrengthsWeaknesses.tsx
extracted_at: 2026-09-03T14:12:16Z
extraction_level: 2
size_lines: 177
size_tokens: 1307
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "1b7e4d706ee19ab44bae1ec0d0a942e9c6a93da1bd80e876d77c52ae050ff5e2"
---

## Purpose

Strengths & Weaknesses card: two `NoteSection` instances (one per `type: "strength" | "weakness"`), each rendering its notes list with a delete affordance plus an add-note input row. Mobile port of the web `PlayerStrengthsWeaknesses` card. Adds via `POST /app/add_coach_note`, deletes via `POST /app/delete/coach_note`; the player-profile query is invalidated after each mutation (inside the out-of-scope `players/hooks.ts` hooks) so server-assigned note ids show up immediately rather than needing a manual refetch.

## Connections

Uses:
- `./hooks` → `frontend/apps/mobile/src/features/players/hooks.ts` (OUTSIDE this scope, cross-scope edge): `useAddCoachNote`, `useDeleteCoachNote`.
- `@levelup/config` (frontend/packages/config/src/index.ts): `lightTheme`.
- `@levelup/types` (frontend/packages/types/src/index.ts): `CoachNote`.
- `@/components/ui/{button,card,input,text}` (outside this scope).

Used by: none within this scope — rendered by the player-detail screen outside this slice.
