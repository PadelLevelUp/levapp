---
path: frontend/apps/web/e2e/player-management/duplicate-name-warning.spec.ts
extracted_at: 2026-09-03T15:30:00Z
extraction_level: 2
size_lines: 46
size_tokens: 460
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "a58af94f57b5bbbeb1c9be31838b47920ad680356f65a529d582c86a1f502de6"
---

## Purpose

E2E for PAD-17: the add-player Name field WARNS (never blocks) when a typed
name case-insensitively duplicates an existing player — typing "e2e student"
(lowercase) against the seeded "E2E Student" surfaces a non-blocking warning
under the field while the "Create player" button stays enabled, letting the
coach proceed anyway (duplicate names are legitimate — twins, common names).
A second test asserts a genuinely unique name produces no warning at all.

## Connections

- Uses: `helpers/auth` (`loginAsCoach`); `helpers/navigation` (`openPlayers`).
  (Scope `web-e2e-a`.)
- Used by: — (Playwright entry point)
- Semantically related (not imports): exercises the duplicate-name check in
  `AddPlayerSheet.tsx` / `player_service.py`; covers
  `.specflow/specs/players/duplicate-name-check.spec.md` (warn-don't-block
  policy).
