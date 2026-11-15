---
about: Player search found a name only when the typed words came in the name's own order
permanence: stable
verified: "2026-10-07 (observed)"
origin:
  - migrated:compass/bugs/B-362-player-search-needs-the-words-in-order.md@ef7a5f3
need:
  - backend/padel_app/services/player_service.py
  - frontend/apps/web/src/components/calendar/PlayerSelector.tsx
  - frontend/apps/mobile/src/features/calendar/player-selector-logic.ts
aliases:
  - B-362
  - B-362-player-search-needs-the-words-in-order
---

# B-362 — Player search needs the typed words in the name's order

**Source:** PAD-516 (Discord report). Id in Session-D's range, numbering unconfirmed.

**What happens:** "pedro sousa" finds nothing for "Pedro Mesquita e Sousa". The roster search
(`coach_players_paginated`, `search_coach_players`) did one `ILIKE '%pedro sousa%'`; the web
and iOS class pickers did one `includes()` of the whole query.

**Reproduced:** `test_pad516_any_order_search.py` — 3 of 4 red on the unpatched service, green after.

**Root cause (type 2, incomplete rule):** `players.list` rule 3 said "matches against player name
(case-insensitive)" and never said how a multi-word query matches; every implementation took it as
one substring.

### Resolution
- Spec: `players.list` rule 3 + criterion; `classes.create` rule 10 points at it.
- Code: `@levelup/config` `nameMatchesQuery` (web picker, iOS picker, web mock API);
  `player_service.name_matches_query` (both roster searches), the same normalisation in Python,
  applied after the coach scope and before pagination — so "joao" finds "João" on the server too
  (coordinator's call on #569; no `unaccent` needed).

<!-- 3.x fields of compass/bugs/B-362-player-search-needs-the-words-in-order.md, carried verbatim by cortex migrate -->
```yaml
type: incomplete-rule
severity: medium
status: resolved
resolved: "2026-10-07"
affects:
  - players.list
  - classes.create
  - backend/padel_app/services/player_service.py
  - frontend/apps/web/src/components/calendar/PlayerSelector.tsx
  - frontend/apps/mobile/src/features/calendar/player-selector-logic.ts
proposed_fix: "Every typed word must appear in the name, in any order: one helper per side (nameMatchesQuery in @levelup/config, name_matches_all_words on the server)."
```
