---
id: B-523
title: "The make-up round showed 'faltas justificadas 33%', a rate, while the 'has a make-up' rule counted absences against accepted invitations; no number said how many classes a student was owed"
type: wrong-rule
severity: medium
status: resolved
affects:
  - attendance.stats
  - notifications.invite-simulation
  - backend/padel_app/services/notification_service.py
  - backend/padel_app/services/invite_simulation_service.py
  - frontend/packages/config/src/invite-simulation.ts
proposed_fix: "One count, classes owed = justified absences minus accepted invitations (never below 0), drives the has_makeups rule, the justified_misses tiebreaker and the simulation chip ('N aulas por repor')."
opened: 2026-10-11T17:01:00Z
resolved: 2026-10-11T17:01:00Z
---

# B-523 — The make-up count was shown as a justified-miss rate

**Source:** Linear PAD-505 (a coach, via Discord).

**What happened:** in the invite simulation, on web and iOS, each student in the
"Aula por repor / Tem reposição pendente" round showed "faltas justificadas 33%". That is the
`justified_misses` tiebreaker's rate: justified absences over every class. The rule that put
them in the round used a different measure: justified absences greater than accepted invitations.
The tiebreaker ranked by the rate.

**What should happen:** the coach sees how many classes the student is owed, as a count. The same
count decides the rule and the ranking.

**Root cause:** a wrong rule. `attendance.stats` rule 3 left "who is owed a make-up" open, and
the tiebreaker sorted on a rate that is not that count.

**Evidence:** reproduced in `test_pad505_makeups_owed.py`. In the ranking cell, Ana (2 owed, 20 %)
came after Bruno (1 owed, 50 %), and the payload carried only `{"rate": 0.5}` and `{"rate": 0.2}`.

**Resolution:** `makeups_owed_for` (attendance.stats rule 3, owner decision 2026-10-11) counts
justified absences minus accepted invitations, never below 0. It feeds `_has_makeups`, the
tiebreaker and the simulation's `owed`. The chip reads "N aulas por repor", and the zero form is
"nenhuma aula por repor". `rate` stays in the payload for builds released before PAD-505.
