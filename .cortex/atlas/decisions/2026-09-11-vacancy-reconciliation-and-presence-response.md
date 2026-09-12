---
id: decision.2026-09-11-vacancy-reconciliation-and-presence-response
title: "Draft skeleton: vacancies reconcile with capacity, one presence response enum (PAD-271, audit M4/M5)"
date: 2026-09-11T00:00:00Z
compass_rules: []
related_specs:
  - attendance.presence
  - attendance.confirm
  - notifications.invitations
  - notifications.waiting-list
  - notifications.semi-auto-approval
supersedes: []
sources:
  - ../../archive/documents/data-model-audit-2026-09-02/extracted/findings.md
  - 2026-09-11-per-occurrence-enrolment-source-of-truth.md
---

# Draft skeleton: vacancies reconcile with capacity, one presence response enum

**Status:** SPEC WRITTEN on the recommended defaults (coordinator, 2026-09-11): M4 as `notifications.invitations` rule 13 (coded, no migration); M5 as `attendance.presence` rule 7, HELD before its migration until the owner answers decisions 6–8. Ledger B-072. Session H, 2026-09-11. Gated on the PAD-259 decision: the
response enum lives on whichever row the owner makes the enrolment. Written against `staging`
72ac170a8. To be filled in once PAD-259 is chosen; two PRs as the audit suggested.

## M4: a vacancy never learns the class is full

**Today.** `vacancies.status` moves `open → filled` only inside the engine
(`_add_player_to_instance` callers at `notification_service.py:3699, 3778, 4320`). A coach adding
a player on the instance editor, a walk-in on the attendance sheet, an accepted join request that
bypasses the vacancy, and a student who re-confirms after declining all fill the spot without
touching the vacancy, so `process_invitation_batches` keeps inviting for a full class every two
minutes. `_fill_from_waiting_list` (`4289`) checks the vacancy's status but not capacity;
`open + approval_status=dismissed` is a fourth state; `NotificationEvent.queued`,
`LessonInstance.rescheduled` and `Lesson.ended` are never written; `completed` is written by one
service and derived by the calendar.

**Proposed rule.** Capacity is the truth and vacancies follow it:
1. Every enrolment goes through the single `enrol()` of PAD-259, which closes one open vacancy for
   the instance (the departing player's own if there is one, else the oldest structural one) in
   the same commit, `filled_by_player_id` set. This is where "first fill wins" already converges
   (PAD-131, PAD-261).
2. A reconciliation step at the top of the two-minute tick: for each open vacancy whose instance
   has `effective_filled_spots >= max_players`, mark it `filled` (or `expired` when the class is
   over, which `_send_invitation_batch` already does) and retire its live invitations with the
   spot-filled message. Idempotent; runs before any batch is sent.
3. ~~`open + dismissed` becomes `expired`~~ DROPPED (Session H, 2026-09-11): `notifications.semi-auto-approval` rule 7 says a dismissed vacancy REMAINS OPEN for the manual flow; reconciliation closes it only when the class is full or over, like any other.
4. Dead states: decide per value whether to write it or drop it from the enum. Proposed: drop
   `NotificationEvent.queued` and `Lesson.ended`; keep `LessonInstance.rescheduled` only if the
   PAD-275 per-instance time override starts writing it, else drop.

**Migration:** none for 1 and 2. For 3 a data update (`UPDATE vacancies SET status='expired' WHERE
status='open' AND approval_status='dismissed'`). Enum value drops (4) are a native-enum ALTER on
Postgres, so they wait for a slot where a failed upgrade is cheap; SQLite tests do not exercise
them.

**Read-only count for the staging copy of prod:** open vacancies on full instances, and open
vacancies on instances that already started (both should be zero after the tick runs).

```sql
SELECT v.id, v.lesson_instance_id, li.max_players, li.start_datetime
FROM vacancies v JOIN lesson_instances li ON li.id = v.lesson_instance_id
WHERE v.status = 'open'
  AND (li.start_datetime < now() AT TIME ZONE 'Europe/Lisbon'
       OR li.max_players <= (SELECT count(*) FROM presences p
                             WHERE p.lesson_instance_id = li.id
                               AND p.status IS DISTINCT FROM 'absent'));
```
(The capacity sub-select assumes PAD-259 option A; under C replace `presences` with the junction
minus absent presences.)

## M5: presence flags overlap and mean different things by path

**Today** (`models/presences.py:31-39`): `invited` is set for everyone at materialisation, so it
carries no information (attendance.presence rule 1a already says so); `confirmed=True` means
"answered", not "coming" (`_free_spot_for_declining_player` sets it on a decline,
`notification_service.py:2814-2818`); `status=absent` is written by the student's decline and by
the coach's attendance mark, distinguishable only through `validated` and `justification`;
`late_cancellation` is a fifth flag on the same row. PAD-273 made the three booleans NOT NULL with
defaults, so "never set" is gone, but the meanings still overlap.

**Proposed columns** (on the enrolment row, i.e. `presences` under PAD-259 option A):

| Column | Values | Written by |
|---|---|---|
| `response` | `none` (default), `confirmed`, `declined`, `cancelled`, `proactive_decline` | the student's own actions only: reminder yes/no, cancel, proactive decline |
| `responded_at` | UTC instant or NULL | same |
| `recorded_by` | `student`, `coach`, `system`, `import` | every write of `response` or `status` |
| `status` | `present`, `absent`, NULL, unchanged | the coach's attendance mark and the import only |
| `justification`, `validated`, `late_cancellation` | unchanged | unchanged |
| `invited`, `confirmed` | derived until the clients move: `invited = true` always; `confirmed = response <> 'none'` | serializer only, then dropped in a later PR |

Capacity then reads `response NOT IN ('declined','cancelled','proactive_decline') AND status IS
DISTINCT FROM 'absent'`, which today's two-valued `status` cannot express (a student decline and a
coach absence look the same). `late_cancellation` could fold into `response='cancelled'` plus a
comparison of `responded_at` against the deadline, but the spec exposes it as a column
(`attendance.confirm` rule 7), so it stays for now.

**Backfill:** from the flags: `status='absent' AND validated=false` → `declined`
(`cancelled` where `late_cancellation`), `confirmed AND status IS DISTINCT FROM 'absent'` →
`confirmed`, else `none`. `responded_at` from `reminder_attempts.responded_at` where a row exists,
else NULL. `recorded_by` from `validated` (coach) else student. Stored as short strings with CHECK
constraints (the PAD-259 draft's rule for new enumerations).

**Clients:** web and iOS read `status`, `confirmed`, `justification` and `lateCancellation` to draw
the participant row and the student's own attendance block (`ClassDetailSheet.tsx`,
`app/class/[id].tsx`, `ClassFillBar`, `capacity.ts`). The serializer keeps the legacy booleans
derived so no client changes in the first PR; a second PR moves both shells to `response` and drops
the booleans.

## PAD-282 hand-off

The PAD-259 draft reads PAD-282 as "no instance row, nothing to cancel", not as an M5 flag split.
If Session I's repro contradicts that and the cause is a guard reading `confirmed` or `status`,
it lands here under M5 instead.

## Open questions for the owner

1. Confirm the reconciliation belongs on the tick (option 2) rather than only inside `enrol()`;
   the tick catches raw writes (editor, import) that never call `enrol()`.
2. Drop the dead enum values or leave them declared.
3. Keep `late_cancellation` as a column or derive it from `response` and `responded_at`.
