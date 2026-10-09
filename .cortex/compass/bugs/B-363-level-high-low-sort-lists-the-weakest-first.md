---
id: B-363
title: "Players tab: \"Level High→Low\" listed the weakest level first"
type: layer-drift
severity: medium
status: resolved
resolved: 2026-10-07T22:49:46Z
affects:
  - players.list
  - backend/padel_app/services/player_service.py
proposed_fix: "level-desc orders by the canonical ladder key (levels rule 10), strongest first; level-asc is its reverse."
opened: 2026-10-07T22:49:46Z
---

# B-363 — "Level High→Low" listed the weakest first

**Source:** PAD-521 (Discord). Id in Session-D's range, numbering unconfirmed.

**What happened:** `coach_players_paginated?sort_by=level&sort_dir=desc` ordered by
`display_order DESC`. Lower `display_order` is the stronger level (`levels.coach-levels` rule 3), so
"High→Low" showed the weakest first, on web and iOS (both render the server's order).

**Reproduced:** `test_pad521_level_order.py` — all 4 red on the unpatched service and route.

**Root cause (type 6, layer drift):** the levels spec fixed "lower is stronger" and rule 10 says every
consumer reads the ladder through the canonical key; the roster sort compared raw integers in the
direction of the word "desc".

### Resolution
`players.list` rule 4 says what each option means, with a criterion; the sort uses the canonical key
(unordered levels weakest, id tie-break) in both directions; players with no level stay last.
