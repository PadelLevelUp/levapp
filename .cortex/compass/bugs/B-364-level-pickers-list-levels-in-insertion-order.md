---
id: B-364
title: "Level pickers listed the coach's levels in creation order, not ladder order"
type: layer-drift
severity: medium
status: resolved
resolved: 2026-10-07T22:49:46Z
affects:
  - levels.coach-levels
  - backend/padel_app/modules/frontend_api.py
proposed_fix: "GET /api/app/coach_levels returns sort_ladder(coach.levels): strongest first."
opened: 2026-10-07T22:49:46Z
---

# B-364 — Level pickers listed levels in creation order

**Source:** PAD-522 (Discord), reported next to PAD-521. Id unconfirmed.

**What happened:** `GET /api/app/coach_levels` returned `coach.levels`, an unordered relationship,
so levels came back in creation order. After a coach reordered the ladder in Settings, the player
profile editor and the add/edit sheets (web and iOS, which render the list as received) showed a
scrambled order.

**Reproduced:** `test_the_levels_list_comes_strongest_first`, red on the unpatched route.

**Root cause (type 6):** `levels` rule 10 requires the canonical ordering for every consumer; the
route skipped it. `get_coach_levels` in coach_service already used `get_level_ladder`.

### Resolution
The route sorts with `sort_ladder`; rule 10 names the endpoint; one criterion.
