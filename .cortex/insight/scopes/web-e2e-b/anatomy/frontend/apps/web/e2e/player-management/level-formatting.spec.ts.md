---
path: frontend/apps/web/e2e/player-management/level-formatting.spec.ts
extracted_at: 2026-09-03T15:30:00Z
extraction_level: 2
size_lines: 23
size_tokens: 271
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "7be4c3cbda2fc6dd53bb9e1e7e636f487aad1a6ecabf0f283235978b506282db"
---

## Purpose

E2E for PAD-14: the level-select dropdown must render the level code as a
visually distinct, bold element ("|"-separated from the label) instead of the
old run-together "CODE – Label" text. Single test: opens the add-player
sheet's level select, finds the seeded "B1 | Beginner" option, and asserts
the option contains a literal "|" plus a `.font-semibold` element containing
just "B1".

## Connections

- Uses: `helpers/auth` (`loginAsCoach`); `helpers/navigation` (`openPlayers`).
  (Scope `web-e2e-a`.)
- Used by: — (Playwright entry point)
- Semantically related (not imports): exercises the same level `<Select>`
  option-rendering as `create-player-level-dropdown.spec.ts` and
  `players/set-player-level.spec.ts` (all three assert on the identical
  `/I1\s*\|\s*Intermediate/`-style formatting); covers
  `.specflow/specs/levels/player-assignment.spec.md`.
