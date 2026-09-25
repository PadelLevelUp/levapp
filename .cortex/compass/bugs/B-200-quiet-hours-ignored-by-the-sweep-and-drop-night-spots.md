---
id: B-200
title: "Quiet hours: the 2-minute sweep invites at night, and a night start trigger loses never-filled spots"
type: incomplete-rule
severity: high
status: resolved
affects:
  - notifications.config
  - backend/padel_app/services/notification_service.py
proposed_fix: "Restrictions gate every send path (the sweep too); a quiet-hours refusal creates and holds the vacancies instead of dropping them (rule 6d)."
opened: 2026-09-25T14:21:58Z
resolved: 2026-09-25T14:21:58Z
---

# B-200: quiet hours don't hold the sweep, and a night trigger drops spots

**Source:** found by Session-D while answering PAD-451's "to confirm" questions. Which messages do quiet hours block? What happens to an invitation due during them: queued or dropped? The id comes from Session-D's range B-196–200.

**What happens (two faces of one gap):**
1. `_check_restrictions` (quiet hours, `minTimeBeforeClass`, `maxTotal`) was asked only by `trigger_invitations`. The periodic sweep `process_invitation_batches` (every 2 min) also sends: a fresh vacancy's first batch, an empty round, the inactivity batch. It never asked. A vacancy opened at night by a cancellation was invited on the next tick, inside quiet hours.
2. `trigger_invitations` returned before creating the class's open vacancies whenever the check refused. The invitation-start trigger is a one-shot `DateTrigger`, so if it fired during quiet hours, a never-filled spot got no vacancy at all. The sweep only looks at existing vacancies, so nobody was ever invited. That is the "vaga para aula logo de manhã" case the ticket worried about.

## Evidence
`test_pad451_quiet_hours_hold_the_sweep.py` on staging (the fix branch before the change), with quiet hours on and a class at 09:00 Lisbon on 11 June 2026:
- Sweep at 23:30 Lisbon: **1 invitation sent** (expected 0). Red.
- Start trigger at 23:30, then the sweep at 07:30: **0 invitations** (expected ≥ 1). Red.
- Controls: quiet hours off means the 23:30 sweep sends (green); a held vacancy is sent at 07:30 (green).

## Diagnostic tree
1. Dev spec `notifications.config`, rules 6/6a. Yes.
2. The rules say what quiet hours ARE, but not which paths they gate, nor what happens to what they refuse. **Incomplete rule.**

## Resolution
- **Spec:** rule 6d (restrictions gate every send path; quiet hours hold rather than drop) and two criteria.
- **Code:**
  - The sweep asks `_check_restrictions` before any send and skips a refused vacancy until a later tick.
  - `trigger_invitations`, when quiet hours are the ONLY refusal (`_held_only_by_quiet_hours`), creates the open vacancies and sends nothing.
- **Tests:**
  - The 4 cells above, plus "a trigger refused for another reason creates no vacancy". A mutant that holds on any refusal turns that cell red.
  - `test_notification_schedule.py`'s mock-only timer tests stub `_check_restrictions`: they have no app context, and the path is covered by the new DB-backed file.
- **Side effect, intended by the rule:** the sweep now also honours `minTimeBeforeClass`. A class starting too soon is no longer invited by a later tick.
