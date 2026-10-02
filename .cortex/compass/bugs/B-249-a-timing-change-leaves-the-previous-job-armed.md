---
id: B-249
title: "A reminder or invitation timing changed to a time already past (or to none) leaves the previously armed job in place, and it fires"
type: incomplete-rule
severity: medium
status: triaged
affects:
  - notifications.config
  - notifications.reminders
  - backend/padel_app/scheduler.py
  - backend/padel_app/services/notification_service.py
  - frontend/apps/web/src/components/settings/RemindersSection.tsx
proposed_fix: "Re-derive each job from the saved config and REMOVE a job whose new fire time is past or none; one derivation for the settings change, the startup re-arm and the daily pass."
opened: 2026-10-02T09:03:55Z
---

# B-249: a timing change leaves the previous job armed (PAD-478)

**Source:** Session-C's code read during the PAD-473 settings survey, 2026-10-02. Reproduced by Session-A the same day.

**What happens:** a coach changes `reminderTiming` or `invitationStartTiming`. `reschedule_all_future_jobs` re-arms each future class. `schedule_instance_jobs` and `schedule_lesson_reminder_jobs` replace a job only when the NEW fire time is in the future; when it is already past, or the timing is `none`, they log (or do nothing) and the job armed from the previous value stays. The web form saves per control, so a job armed from an intermediate value can be the one that stays.

**Consequence (measured):** the surviving reminder job sends. `_run_send_reminders` and `send_class_reminders` do not re-check the timing. The student gets one FIRST reminder at a time the current configuration does not imply. It is not a duplicate: the per-student cap and PAD-407's spacing guard hold, and a job survives only when no new job was armed. A surviving invitation-start job fires at the old, later time; `trigger_invitations` honours `invite_not_before`, quiet hours and a class that is over, so invitations start late, not early.

**What should happen:** after a timing change no job remains armed at a time the saved configuration does not imply.

**Evidence:** `backend/padel_app/tests/test_pad478_stale_timing_jobs.py` on staging 80cd3b3c4, a real APScheduler (memory store, paused) and a pinned clock: a baseline with both times in the future passes; six cases fail (reminder, intermediate value, invitation start, the measured send, an occurrence job, type `none`). The observation that selects the cause is the job's `run_date` after the change: still the old instant.

**Prod (read-only, both run by the coordinator on 2026-10-02):**
- 08:59 UTC, `apscheduler_jobs` against each coach's current config: 120 reminder and invitation jobs, all matching; no stale job. That run resolved a class's coach as the lowest coach id; the query now takes the first coach row, as `primary_coach` does. The two differ only for a class with two coaches, and the next read found none whose timings differ, so it was not re-run.
- 09:37 UTC, classes reachable by a non-primary coach (a co-coach's own row, or the lesson's coach) whose implied reminder or invitation time differs from the primary's: 0 future classes, 0 active lessons. No class in prod could have lost a job through the co-coach or substitute path.

**Open product decision (with the owner):** what a class gets when the coach's new reminder time is already past: nothing (what a class created inside the window gets today), a reminder now, or the old-time reminder (today's accident). For invitations, whether a past start means "start now".

**Affected specs:**
- Dev: `.specflow/specs/notifications/config.spec.md` rule 10 ("Updating timing configs reschedules all future scheduler jobs") says nothing about a new time that is past.
- Business: unchanged until the owner's decision.

### Change plan
- Spec: rules 10a, 10c, 10d and criteria (wording with the coordinator).
- Tests: the six strict-xfail cases in `test_pad478_stale_timing_jobs.py` lose their mark.
- Code: one derivation that arms, replaces or removes; used by the settings change, `_startup_reschedule` and the daily window pass. At startup and daily a past time means no job and nothing sent.
- Deploy constraint: the fix must not send, re-send or suppress a reminder for an existing class as a side effect of being deployed.

### Found in review (opus, #496 at 101d095ee), fixed before merge
The first version of the fix derived a class's jobs from whichever coach triggered the derivation. With removal on a past time, a co-coach's pass (the startup loop over every coach, or their own save) or the lesson coach's occurrence walk for a substituted occurrence REMOVED the primary coach's job: a suppression the fix itself introduced. Reproduced by the reviewer, then by `test_pad478_primary_coach_decides.py` (7 tests; 6 red at 101d095ee). Jobs are now derived from the class's primary coach, whoever triggers it. Before PAD-478 the same mismatch re-armed the job at the other coach's time, whichever coach was processed last.

### Second review (opus, at 6daef326c): approved, with these closed in the same PR
- `_maybe_rearm_reminder` read the occurrence's own coach rows only, unordered. A class coached through its lesson therefore never had a follow-up armed (red test: first reminder sent, no retry job). It now uses `primary_coach`.
- Invitations: `trigger_invitations` reads its whole configuration from the coach id in the job's args. The derivation now always arms `invite_start_<id>` with the primary coach, where before the last coach to reach a co-coached class won. For such a class the mode, groups, eligibility and auto-notify can therefore change coach at the first startup after deploy. Prod, read-only, run by the coordinator on 2026-10-02 10:43 UTC: 3 coaches, 0 lessons with two or more coaches, 0 future instances with two or more coaches, 0 future instances whose coach differs from the lesson's, 3 notification configs. Nothing changes on deploy today.
- Rule 10e: the lock was per triggering coach and the passes took none. Every derivation now holds the class's primary coach's lock and reads the configuration again inside it, without creating one.
