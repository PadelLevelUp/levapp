---
id: B-250
title: "Raising hoursBetweenReminders while a follow-up is pending loses that follow-up"
type: incomplete-rule
severity: medium
status: triaged
affects:
  - notifications.config
  - notifications.reminders
  - backend/padel_app/scheduler.py
proposed_fix: "On a spacing or count change, re-time each pending follow-up job to the last reminder sent plus the new spacing, or remove it when none is owed."
opened: 2026-10-02T09:03:55Z
---

# B-250: raising the reminder spacing loses a pending follow-up (PAD-478)

**Source:** found by Session-A while reproducing B-249, 2026-10-02. The opposite direction from B-249: a suppression, not an extra send.

**What happens:** `reschedule_all_future_jobs` never touches the retry jobs (`reminder_<id>_retry_<ts>`, `reminder_lesson_<lesson>_<date>_retry_<ts>`). With two reminders, the first goes out and arms a retry at the OLD spacing. The coach raises the spacing. The retry fires at the old spacing; the scheduled pass finds the student inside the NEW spacing window (PAD-407's guard), sends nothing and reports nothing more due, so nothing is re-armed. The second reminder is never sent.

**What should happen:** the follow-up goes out one new spacing after the first reminder.

**Evidence:** `test_raising_the_spacing_does_not_lose_a_pending_follow_up` (spacing 2 h raised to 6 h): 1 reminder sent, no reminder job armed. Baseline with the spacing unchanged: 2 sent.

**A trap recorded in the test:** `record_attempt` stamps `sent_at` from the real clock (`datetime.utcnow()`), which `pin_clock` does not reach. On its first run the test passed because the spacing check compared 2027 with today. The test sets the attempt's `sent_at` to the pinned instant.

**Neighbours:** B-161 / PAD-407 (the spacing guard that ends a duplicate chain is the same guard that ends this legitimate one). The fix must not weaken it.

**Affected specs:** `.specflow/specs/notifications/config.spec.md` rule 10; `.specflow/specs/notifications/reminders.spec.md` (retry chain).

### Change plan
- Spec: rule 10b and a criterion.
- Tests: the strict-xfail case loses its mark; add the lowered-spacing and the count-lowered cases.
- Code: on a spacing or count change, re-time or remove the pending follow-up jobs of the coach's classes. PAD-407's tests stay green.
