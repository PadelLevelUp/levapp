---
path: frontend/apps/web/e2e/players/set-player-level.spec.ts
extracted_at: 2026-09-03T15:30:00Z
extraction_level: 2
size_lines: 50
size_tokens: 617
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "b739e3702968db578fcb32bbfae91cdfe288068de0f82b1e3ece202ba1c8d518"
---

## Purpose

E2E regression (US-37) for a level-select persistence bug: the backend
serializes the player-level association's level as an INTEGER `levelId`, but
the level `<Select>`'s options use STRING ids, so `String(levelId)` was never
compared and the dropdown never reflected/applied the saved level. The test
sets the level (second combobox, after Side) to "Intermediate", saves,
asserts the "I1 | Intermediate" badge renders, RELOADS to confirm it persisted
server-side (not just client state), then re-opens edit mode and asserts the
Select control ITSELF shows the saved value selected — the strongest
regression check, since the original bug was specifically that the control
couldn't render its own saved state.

## Connections

- Uses: `helpers/auth` (`loginAsCoach`); `helpers/navigation` (`openPlayers`).
  (Scope `web-e2e-a`.)
- Used by: — (Playwright entry point)
- Semantically related (not imports): exercises the Level `<Select>` (second
  combobox) in `PlayerHeader.tsx` and its integer/string id coercion, and the
  level-association serializer on the backend; covers
  `.specflow/specs/levels/player-assignment.spec.md`. Shares locator/formatting
  conventions with `player-management/level-formatting.spec.ts` and
  `player-management/create-player-level-dropdown.spec.ts`.
