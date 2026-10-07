---
id: B-362
title: "Player search found a name only when the typed words came in the name's own order"
type: incomplete-rule
severity: medium
status: resolved
resolved: 2026-10-07T22:23:21Z
affects:
  - players.list
  - classes.create
  - backend/padel_app/services/player_service.py
  - frontend/apps/web/src/components/calendar/PlayerSelector.tsx
  - frontend/apps/mobile/src/features/calendar/player-selector-logic.ts
proposed_fix: "Every typed word must appear in the name, in any order: one helper per side (nameMatchesQuery in @levelup/config, name_matches_all_words on the server)."
opened: 2026-10-07T22:23:21Z
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
  `player_service.name_matches_all_words` (both roster searches; LIKE wildcards stay literal).
- Known difference kept: the server folds case only; the local pickers also fold accents and
  punctuation, as before. Folding accents in SQL needs Postgres `unaccent` (a migration) — not here.
