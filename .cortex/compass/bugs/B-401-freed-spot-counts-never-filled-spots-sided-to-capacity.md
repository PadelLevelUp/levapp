---
id: B-401
title: "In a class that is not full, a freed spot counts the never-filled spots (sided to an even class at capacity), so it asks the side the coach sees as the longer one"
type: wrong-rule
severity: high
status: triaged
affects:
  - notifications.invitations
  - notifications.invitations rule 2b
  - notifications.invitations rule 2c
  - notifications.invite-simulation rule 9
  - backend/padel_app/services/notification_service.py
related_specs:
  - .specflow/specs/notifications/invitations.spec.md
  - .specflow/specs/notifications/invite-simulation.spec.md
  - .specflow/specs-business/notifications/coach-fills-vacancies-automatically.business.md
proposed_fix: "Rule 2c counts the players going and the class's other FREED spots, never its never-filled spots (candidate A); rule choice pending the owner (PAD-565). Id unconfirmed (range B-401–420, wave 13)."
opened: 2026-10-09T18:52:00Z
---

# B-401: a freed spot in a non-full class asks the side the class is short of at capacity

**Source:** PAD-565 (human report, 2026-10-09, reproduced). The ticket's roster: 16 places, 6 left +
2 right enrolled, one left player leaves → the engine's next invitation goes to a LEFT player; the
coach expected right (5 left + 2 right are going).

**What happens:** `freed_spot_side` → `_side_counts` (notification_service.py, about line 2871)
adds "the sides of the class's other open vacancies" to the roster count, exactly as rule 2c says.
In a class that is not full, those open vacancies are the never-filled spots that rule 2b sided
toward an even class AT CAPACITY: 6L/2R + 8 spots → 6 right + 2 left (projecting 8 / 8). The freed
spot therefore counts 5 / 2 holding + 2 / 6 open = 7 / 8 and asks left. The invite simulation
(rule 9) calls the same function and shows the same answer (the ticket's "lista sugerida").

**What should happen (ticket, pending the owner):** the first invitation after the absence goes
to the side with fewer players going (right); ties keep the leaver's side; the same in a full or a
non-full class. The owner has not approved the ticket's wording; the candidates are in
`docs/plans/2026-10-09-pad565-side-rule-proposal.md` (gitignored; also sent to the coordinator).

**Evidence (phase 1):** `backend/padel_app/tests/test_pad565_side_balance_non_full_class.py`
(8 tests, green on SQLite at 4757c13d9, run from the worktree with the main checkout's venv):
- rule 2b on the ticket's roster gives 6 right + 2 left never-filled spots;
- with those open, the left leaver's spot is `left` (the ticket's observation) through
  `_create_vacancy_for_absent_player`, through `_find_or_create_open_vacancies` (the coach's absent
  mark and the tick, `any_open=True`) and through `_free_spot_for_declining_player` (a reminder
  "no" and a cancellation) — all three paths converge on `freed_spot_side`;
- with NO never-filled spot open yet (outside the window, or the invite-start job creating the
  leaver's spot first), the same leaver's spot is `right`. So the precondition is "rule 1c's tick
  (PAD-540) or the invite-start job already opened the never-filled places", not the leaver's path;
- the ticket's full-class rows (2L+2R → left; 3L+1R → right) already hold today;
- `_side_counts` does exclude the leaver and absent presences (`holding_presences`, and
  `test_the_leaver_is_counted_out_even_while_still_holding` in test_pad541).
Not "round 2 widened to any side": the vacancy's own `side` column is left; rules 2b/2c's widening
is unchanged and not in question.

**Root cause:** Type 3, wrong rule. Rule 2c's "plus the sides of the class's other open vacancies"
was written for a full class (PAD-541's case has no never-filled spot) and, applied to a class whose
never-filled spots carry rule 2b's capacity-projected sides, makes the freed spot balance the
projection rather than the roster. Both the dev spec (rules 2b/2c) and the business spec
(lines 52–57) describe this behaviour, so the layers agree with each other and with the code: not
drift, a rule the owner must re-decide.

**Affected specs:**
- Dev: `.specflow/specs/notifications/invitations.spec.md` (rules 2b, 2c, criterion "A freed spot
  asks the side the class is short of"), `.specflow/specs/notifications/invite-simulation.spec.md`
  (rule 9 wording)
- Business: `.specflow/specs-business/notifications/coach-fills-vacancies-automatically.business.md`
  (the "balance" bullets, lines 52–57)

### Change Plan

**Spec to modify:** `.specflow/specs/notifications/invitations.spec.md` — **Change type:** correct
rule 2c (and 2b's cross-reference) + update criteria. Final text waits on the owner's choice among
the candidates (PAD-565 note: the engine rule is not changed without the owner validating it).

**Recommended (candidate A):** change rule 2c's count from "the players still holding a spot,
minus the leaver, plus the sides of the class's other open vacancies" to "the players still holding
a spot, minus the leaver, plus the sides of the class's other open FREED spots (a vacancy with a
departing player); never-filled spots are not counted, they are rule 2b's and already balance
around the players going". Rule 2b unchanged. Criteria to add: the ticket's three rows and the
"never-filled spots open first" case (the 2×2 in the test file).

**Cross-layer check:** business spec lines 55–57 need one sentence: a freed spot looks at who is
going, not at the spots still being filled.

**Then:**
1. Owner picks the rule (coordinator relays). 2. Spec-editor applies it (dev + business + invite
simulation rule 9). 3. Flip the `TODAY` assertions in test_pad565 to the chosen rule, add the
criteria's tests. 4. Fix `_side_counts`/`freed_spot_side`. 5. Regression: test_pad541, test_pad421,
test_b302, invite simulation tests, notifications domain. 6. Tell Session B (PAD-564 help text,
PAD-566 tutorial counts).

### Resolution

Pending.
