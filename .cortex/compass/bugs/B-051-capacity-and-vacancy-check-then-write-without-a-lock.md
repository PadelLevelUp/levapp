---
id: B-051
title: "Capacity, one-winner-per-vacancy and materialisation are check-then-write with no row lock"
type: incomplete-rule
severity: high
status: triaged
affects:
  - notifications.invitations
  - notifications.waiting-list
  - classes.instances
  - backend/padel_app/services/notification_service.py
  - backend/padel_app/services/lesson_service.py
proposed_fix: "Row-lock the vacancy and the class instance around accept and waiting-list placement and re-read under the lock; get-or-create absent-player vacancies and size structural ones under the instance lock; lock the parent lesson around materialisation. The unique occurrence key and the open-vacancy key go through the B-046 cleanup plan."
opened: 2026-09-10T14:00:00Z
---

# B-051 — Capacity and one-winner-per-vacancy are check-then-write with no lock

**Source:** 2026-09-02 data-model audit, finding H8, re-verified 2026-09-10 and filed as PAD-261.
Ledger number assigned by the coordinator.

**What happens:** there is no `with_for_update` anywhere in `backend/padel_app/services/`.
Accepting an invitation checks the vacancy's status and `_effective_filled_spots(instance)`, then
enrols; two "yes" answers for the last spot can both pass the check. A waiting-list placement enrols
without re-checking the vacancy or the class at all. Two concurrent triggers can both see "no open
vacancy" and both create one for the same departing student. The scheduler and a request can both
materialise the same occurrence (PAD-85 fixed the divergent-time duplicate in code, not with a key).

**Root cause:** Type 2 — incomplete rule. `notifications.invitations`, `notifications.waiting-list`
and `classes.instances` said who wins and what gets created, but never that the decision is taken on
current data under a lock, so every path was written as read-then-write.

**Owner decisions via the coordinator, 2026-09-10:** no unique key on `lesson_instances` and no
partial unique on open vacancies in this ticket — both go through the B-046 cleanup plan (Session A's
PAD-263 adds a non-unique index on the occurrence columns); the row locks and get-or-create now; the
race is proven with two threads on a scratch Postgres, not in CI (the M20 ticket).

### Change Plan

1. Spec: invitations rule 10, waiting-list rule 12, instances rule 8 (committed before code).
2. `_lock_vacancy_and_instance`: `SELECT … FOR UPDATE` + re-read, vacancy first, then the class.
3. Accept (`respond_to_notification` "yes") and `_fill_from_waiting_list` decide under it.
4. `_create_vacancy_for_absent_player` get-or-create and `_create_structural_vacancies` under the
   instance lock.
5. `get_or_materialize_instance` locks the parent lesson row before the lookup.
6. Tests: SQLite behaviour + which rows are locked; scratch-Postgres two-thread race, red on the old
   code and green on the new.

### Resolution

_Filled in when the PR lands._
