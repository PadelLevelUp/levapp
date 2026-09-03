---
path: frontend/apps/mobile/app/player/[playerId].tsx
extracted_at: 2026-09-03T14:11:46Z
extraction_level: 2
size_lines: 506
size_tokens: 4141
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "86664844ecc7dbec919bfa295cbd97479008d31191fb2d8c48125f3dae34ac0e"
---

## Purpose

Player detail screen (coach-only): profile card with inline edit, evaluations list, strengths/weaknesses, and a horizontal action bar (add to classes, standing waiting-list toggle, add evaluation). Sources the player itself by filtering the full coach roster (`useCoachPlayers`) by `playerId` rather than a dedicated by-id endpoint.

## Connections

Uses:
- `frontend/apps/mobile/src/auth/AuthContext.tsx`: `useAuth()` for `user.coachId` (unresolved alias).
- `@/features/players/*` (`LevelLabel`, `PlayerForm`, `StrengthsWeaknesses`, `add-evaluation-form`, `add-to-classes-dialog`, `hooks`, `waiting-list-dialog`): outside this scope.
- `@levelup/hooks` (`useCoachLevels`, `usePlayerProfile`), `@levelup/types` (`sideLabel`): outside this scope (packages).

Used by: no file within this scope.

## Insights

- There is no per-player standing-waiting-list lookup endpoint, so `standingEntry` is derived by fetching the FULL standing waiting list and finding this player in it — a comment explicitly notes this mirrors web's `PlayerDetailPage` for the same reason.
- A comment at the profile header (PAD-105) explains the deliberate absence of an `@username` line: the coach never sets one, and the record holds a generated placeholder until the player activates their own account — showing it would read as a real, meaningful handle.
