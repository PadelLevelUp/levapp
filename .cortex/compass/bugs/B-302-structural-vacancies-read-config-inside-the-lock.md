---
id: B-302
title: "Never-filled vacancies read the coach's configuration inside the class lock: for a coach with no config row the create commits and ends the lock"
type: test-defect
severity: low
status: resolved
resolved: 2026-10-08T10:52:19Z
affects:
  - notifications.invitations
  - backend/padel_app/services/notification_service.py
proposed_fix: "Read the configuration before taking the class lock in _create_structural_vacancies."
opened: 2026-10-08T10:52:19Z
---

# B-302: `_create_structural_vacancies` read the configuration inside its lock

**Source:** found by Session-B on PAD-541 while fixing its twin, B-322 (`_create_vacancy_for_absent_player`).
Session-B scanned `notification_service.py` for configuration reads after a lock in the same function;
this was the one hit in Session-A's area. Id confirmed by the coordinator.

**What happens:** `_create_structural_vacancies` takes the class lock, counts the never-filled places
again, then calls `get_or_create_config`. For a coach with no `notification_configs` row that creates
one and commits, which ends the lock before the new vacancies are added. A second creator that was
waiting on the lock then counts the same places and adds its own: duplicate structural vacancies.

**Latent, not live:** both callers make sure the row exists before calling it. `trigger_invitations`
calls `get_or_create_config` at its top (and returns when the engine is off), and
`vacancies_after_class_edit` (PAD-552) requires a saved configuration. So on staging the read inside the
lock only reads and never commits. A future caller that skipped that would have reopened the race.

## Evidence
`test_b302_structural_config_before_lock.py` (Postgres only): two direct calls on a config-less coach,
held at a barrier just before the class lock. With the read inside the lock: 4 vacancies for a 2-place
class (red). With the read before the lock: 2 (green).

## Diagnostic tree
The rule (invitations rule 10, PAD-261: count again under the lock and add every row in one commit) is
right and stated; the code broke it in a path no test drove, a coach with no configuration row.
**Missing test** for that path.

## Resolution
The read moved above `_lock_instance`; the cell above added. No spec change: rule 10 already says it.

**Follow-up found by #592's Postgres lane (CI, 1 failed / 3687 passed):** with the read before the lock,
two creators on a config-less coach both ran `get_or_create_config` and both inserted; the second hit
`notification_configs_coach_id_key` (UniqueViolation). The local 2/2 green had won that race.
`get_or_create_config` now inserts inside a SAVEPOINT: a concurrent insert rolls back only the
savepoint (never the caller's pending work) and the committed row is re-read. This covers every caller,
including Session-B's `_create_vacancy_for_absent_player` (B-322, #591), which reads the configuration
before its lock the same way. Cell `test_two_concurrent_get_or_create_config_make_one_row_and_both_return_it`
(barrier between the read and the insert): 8/8 green with the fix; the old unguarded insert red 6/6.
