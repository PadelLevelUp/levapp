---
id: B-072
title: "A vacancy only closes through the engine; any other way of filling the spot leaves it open and the engine keeps inviting for a full class"
type: incomplete-rule
severity: medium
status: open
affects:
  - notifications.invitations
  - classes.instance-enrollment
  - backend/padel_app/services/notification_service.py
  - backend/padel_app/services/lesson_service.py
related_specs:
  - .specflow/specs/notifications/invitations.spec.md
  - .specflow/specs/classes/instance-enrollment.spec.md
proposed_fix: "Reconcile vacancies with capacity in the one enrolment writer (enrol) and at the top of the two-minute tick: while an instance has more open vacancies than open spots, close one as filled and expire its sent invitations."
opened: 2026-09-11T00:00:00Z
---

# B-072 — Vacancies never close when the class fills by another door

**Source:** 2026-09-02 data-model audit, finding M4, re-read on `staging` 431148855 and carried by
PAD-271 (Session H). Ledger number from H's reserved range (B-071..B-073).

**What happens:** `Vacancy.status` moves `open → filled` only inside the invitation engine: an
invitation "yes" (`respond_to_notification`), a waiting-list placement (`_fill_from_waiting_list`)
and an accepted join request mark the vacancy they were working. A coach adding a player on the
class editor, a walk-in on the attendance sheet, an import, or a student who re-confirms after
declining all take the spot through `enrol()` without touching any vacancy. `process_invitation_batches`
then keeps inviting for that vacancy every two minutes; accepts are refused by the capacity check
(`_effective_filled_spots >= max_players`, PAD-261), so students receive "you're invited" followed
by "spot filled" for a spot that was never free. `_fill_from_waiting_list` checked the vacancy but
not capacity until PAD-261 added the lock.

**Root cause:** Type 2, incomplete rule. `notifications.invitations` said when a vacancy opens and
who wins it, never that it must close when the class is full by any route. The rule was written
for the engine's own fills and the model got no reconciliation.

**Fix (PAD-271, rule 13):** `enrol()` reconciles the instance it just wrote (close one open
vacancy per spot taken, the departing player's own first, then one with no live invitation, then
the oldest; expire its sent invitations); the tick runs the same reconciliation before sending.
Dismissed vacancies stay open until full or over (semi-auto rule 7). No migration.

**Verification:** `backend/padel_app/tests/test_pad271_vacancy_reconcile.py`, red on the unfixed
code for the four criteria under rule 13.
