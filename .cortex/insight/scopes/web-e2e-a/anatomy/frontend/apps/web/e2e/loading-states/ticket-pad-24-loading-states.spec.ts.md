---
path: frontend/apps/web/e2e/loading-states/ticket-pad-24-loading-states.spec.ts
extracted_at: 2026-09-03T00:00:00Z
extraction_level: 2
size_lines: 187
size_tokens: 1688
centrality: medium
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "eeb6432f884940271ff5e816921e570894edee677f9f2976e84a93ec95b6619b"
---

## Purpose

PAD-24 regression coverage that optimistic UI updates were removed in
favor of real loading states across three surfaces — editing a player
(delays `edit_player` 2s, asserts a spinner/disabled Save appears),
deleting a class (fulfills `remove_class` itself with an 800ms delay so
the request never actually reaches the backend, protecting the seeded
class other spec folders depend on, and asserts a spinner appears while it
is in flight), and creating a class (delays `add_class` 2s, asserts the
submit button shows a spinner). The UI must wait for the backend response
before updating, never update speculatively first.

## Connections

- Uses:
  - `helpers/auth.ts`: `loginAsCoach`.
  - `helpers/navigation.ts`: `openPlayers`, `openCalendar`.
- Used by: — (leaf spec file)
- Semantically related (not imports): project memory flags the "class
  delete" case as a pre-existing fragile-route-mock failure on
  origin/main, not a regression; its `findSeededClass` helper duplicates
  the forward-scan half of `helpers/calendar-navigation.ts`'s
  `findClassOnCalendar` (this scope) without the patient backward rescan.
