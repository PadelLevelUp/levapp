---
id: B-143
title: "Attendance readers behind the eligibility bar, the ranking and the manual-invitation dialog counted the student's record with EVERY coach"
type: incomplete-rule
severity: medium
status: resolved
affects:
  - attendance.stats
  - eligibility.rules
  - backend/padel_app/services/notification_service.py
  - backend/padel_app/services/invite_simulation_service.py
proposed_fix: "Scope _attendance_stats / _attendance_stats_for and the two dialog-group readers by coach_instance_ids(coach_id), like _unjustified_absence_count already is; compare the justified_absences COUNT on that scope."
opened: 2026-09-21T20:20:00Z
resolved: 2026-09-22T13:10:00Z
---

# B-143 — attendance readers counted every coach's classes

**Source:** Session-B's review of PR #357 (finding F3: `_students_with_justified_absences` was
unscoped), widened by the coordinator to every attendance reader used for invitations or
eligibility; reproduced by Session-D at the route and at the engine (`feature/pad-382` @
dc84cd054, 2026-09-22 08:2x UTC, 2 red by design). Ticket PAD-382; id from Session-C's range.

**What happened:** `eligibility.rules` rule 3 says the absence attributes read "the student's
record with this coach", and `_unjustified_absence_count` / `_has_makeups` do (through
`coach_instance_ids`, `classes.coach-assignment` rule 4). Three readers did not:
- `_attendance_stats` / `_attendance_stats_for` (the `justified_absences` and `attendance_rate`
  bars, the wave ranking `_rank_invited`, the approval-queue pick, the invite simulation) read
  every `presences` row of the player; the `justified_absences` branch then multiplied a rate by
  an unscoped total.
- `_students_with_recent_absences` and `_students_with_justified_absences`, which fill two
  default-enabled groups of the manual-invitation dialog (`GET /notify/groups`), read every row.

So coach A's bar, ranking and dialog were shaped by what happened in coach B's classes — a
wrong answer for a student on two rosters, and a small disclosure of another coach's record.

**What should happen:** every such reader sees only this coach's occurrences. A student with two
justified absences with coach B and none with coach A passes A's `justified_absences ≤ 1` bar,
has `(0.0, 0.0)` rates for A's ranking, and is in neither of A's absence groups; the same rows
recorded in A's classes keep counting for A (each fix has its control).

**Root cause (first wrong value):** `_attendance_stats_for` filtered `presences` by `player_id`
only; the rule said "with this coach" but named no scope for these readers, and the batched
rewrite (PAD-276) preserved the unscoped arithmetic faithfully.

**Affected specs:**
- Dev: `.specflow/specs/attendance/stats.spec.md` rule 1 (now names the scope, the batched
  readers and the dialog readers); `.specflow/specs/eligibility/rules.spec.md` rule 3;
  `.specflow/specs/attendance/validation.spec.md` (the third reader's mention).
- Business: unchanged — "a coach's rules read the student's record with that coach" is what
  the outcome already says.

### Change Plan

**Spec to modify:** `attendance.stats` rule 1 — Change type: complete the rule (scope).
**Then:** tests red by design (dc84cd054) → `_attendance_counts_for(player_ids, coach_id)` and
the scoped `_attendance_stats(_for)` → the `justified_absences` branch compares the scoped count →
both dialog readers take `coach_id` → the five callers pass the coach (`coach_id`,
`vacancy.coach_id`) → regression on the engine files.

### Resolution

- Spec changes: `attendance/stats.spec.md` (rule 1), `eligibility/rules.spec.md` (rule 3),
  `attendance/validation.spec.md` (mention).
- Tests: `test_pad382_attendance_readers_are_coach_scoped.py` — dialog (route), bar, rates; each
  with its "same rows with this coach" control (6).
- Code: `notification_service._attendance_counts_for` / `_attendance_stats_for(player_ids,
  coach_id)` / `_attendance_stats(player_id, coach_id)`; `justified_absences` compares the scoped
  count; `_students_with_recent_absences(coach_players, coach_id)`,
  `_students_with_justified_absences(coach_players, coach_id)`; callers: the eligibility
  branches (`coach_id`), `_rank_invited` and the approval-queue pick (`vacancy.coach_id`),
  `get_notification_groups` (`coach_id`), `invite_simulation_service._priority_values`
  (`coach_id`).
- Denominator: kept as PAD-276 had it — every presence row on the coach's occurrences,
  whatever its status. The alternative (present + absent only, leaving unmarked rows out) is a
  product question recorded on the PR, not decided here.
- Resolved: 2026-09-22 (PAD-382).
