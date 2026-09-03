---
path: frontend/apps/web/e2e/player-management/create-player-level-dropdown.spec.ts
extracted_at: 2026-09-03T15:30:00Z
extraction_level: 2
size_lines: 50
size_tokens: 520
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "6f933771c80fd61d1b1fb0d97f9f27aadf940e32c130400c89dbb82337a64b9b"
---

## Purpose

E2E for PAD-29: the skill-level `<Select>` in the add-player sheet must be
usable in both coach states. With levels defined (seeded coach), opening the
select shows "Beginner"/"Intermediate" as `option` roles. With NO levels
defined (`loginAsCoachNoLevels` — a second seeded coach fixture), the select
must show zero options PLUS an explicit "no levels defined yet" empty-state
message while open, and after closing (Escape), a persistent hint linking to
Settings — never a silently empty dropdown.

## Connections

- Uses: `helpers/auth` (`loginAsCoach`, `loginAsCoachNoLevels`);
  `helpers/navigation` (`openPlayers`). (Scope `web-e2e-a`.)
- Used by: — (Playwright entry point)
- Semantically related (not imports): exercises the level `<Select>` inside
  `AddPlayerSheet.tsx`; covers `.specflow/specs/levels/player-assignment.spec.md`
  and `.specflow/specs/players/create.spec.md`. Sibling of
  `level-formatting.spec.ts` (same dropdown, different assertion — code/label
  visual formatting) and `players/set-player-level.spec.ts` (the equivalent
  select on the player-detail edit form) in this scope.
