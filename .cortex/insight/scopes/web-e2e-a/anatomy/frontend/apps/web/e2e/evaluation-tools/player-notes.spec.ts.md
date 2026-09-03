---
path: frontend/apps/web/e2e/evaluation-tools/player-notes.spec.ts
extracted_at: 2026-09-03T00:00:00Z
extraction_level: 2
size_lines: 52
size_tokens: 563
centrality: medium
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "47812bd00864da4d74070f11f98a50345ea2116225544d9c2b05056b36fdd7a1"
---

## Purpose

US-44/US-45 coverage that a coach can add a strength note and a weakness
note to a player's Strengths & Weaknesses section from the player detail
page — toggled into edit mode via the section's own (last) "Edit" button,
distinct from PlayerHeader's first "Edit" button.

## Connections

- Uses:
  - `helpers/auth.ts`: `loginAsCoach`.
  - `helpers/navigation.ts`: `openPlayers`.
- Used by: — (leaf spec file)
- Semantically related (not imports): `.specflow/specs/players/notes.spec.md`.
