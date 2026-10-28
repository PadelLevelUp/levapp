---
id: B-701
title: "A class whose freed spot was filled never opened its other free seat: the filled spot was counted twice"
type: incomplete-rule
severity: high
status: resolved
affects:
  - notifications.invitations
  - backend/padel_app/services/notification_service.py
proposed_fix: "Invitations rule 1d: a free seat is capacity minus the seats held (the header's K vagas); never-filled spots open for the free seats no open spot stands for. _create_structural_vacancies counts open spots only, and the tick's scan reaches a class whose spots are all filled."
opened: 2026-10-28T18:00:00Z
resolved: 2026-10-28T19:00:00Z
---

# B-701: a filled spot hid a free seat

**Source:** SessionH's read of prod rows, 2026-10-28 17:28Z (ids only; "case 16", Linear PAD-763).
Instance 569 (16 seats) held 15 from 20 Oct 14:58Z to 27 Oct 21:00Z with a waiting-list entry
never offered. An accepted join request took the seat; after the coach cancelled it, a spot opened
and the waiting-list student was invited at round 0. At 17:35Z one more class on prod held a
hidden free seat.

**What happens:** `_create_structural_vacancies` counted spots to open as
`effective_max_players - effective_filled_spots - count(vacancies open or filled)`. The student who
fills a spot is enrolled (`enrol(..., "fill")`), so `effective_filled_spots` already counts that
seat; subtracting the filled row too counts it twice (16 - 15 - 1 = 0 on instance 569). The tick's
scan `_open_never_filled_places` skipped every class with a vacancy of any status (rule 1c's
"named limit"), and `_find_or_create_open_vacancies` creates never-filled spots only when no spot
is open. So once a freed spot was filled, no path opened the class's other free seat.

**Evidence:** H's cited lines verified on main 5a996b8ab (notification_service.py:3352, 3358-3362,
5198, 5228, 5759; lesson_instances.py:168). Reproduced in
`test_pad763_free_seat_after_filled_spot.py`: on staging c27b9d1fe the invitation start opened no
spot (`[] == [None]`), the tick opened none (`0 == 1`), and the waiting list was never offered.

**Root cause:** rule 1c said which classes the tick opens and named the filled-spot case as a
limit, but no rule said what a free seat is, so the engine's count drifted from the participants
header's "K vagas" (capacity minus going and unanswered, PAD-771).

**Fix:** invitations rule 1d. `_create_structural_vacancies` subtracts open spots only; the tick's
scan skips a class only for an open or expired spot. Expired spots keep the tick away as before.
Classes holding such a seat when this ships are opened by the first tick after deploy once their
window is open; no data repair.
