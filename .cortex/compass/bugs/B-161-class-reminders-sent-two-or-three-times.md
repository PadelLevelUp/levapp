---
id: B-161
title: "Every class reminder went out 2–3× since 2026-09-16: materialisation's roster enrolment armed one ask pass per student, and concurrent passes raced a count-then-insert guard"
type: incomplete-rule
severity: high
status: open
affects:
  - notifications.reminders
  - backend/padel_app/scheduler.py
  - backend/padel_app/services/lesson_service.py
  - backend/padel_app/services/notification_service.py
proposed_fix: "Suppress PAD-331's ask arming for the roster enrolment done inside the occurrence job; serialise send_class_reminders per instance with a Postgres advisory lock (no migration); a scheduled pass skips a student whose latest attempt is younger than hoursBetweenReminders, so persisted twin retry chains send once."
opened: 2026-09-22T19:03:00Z
---

# B-161 — class reminders sent two or three times

**Source:** owner report, relayed by the Coordinator on 2026-09-22: users got duplicate chat
messages "yesterday" (2026-09-21). Diagnosed by Session-A. Ticket PAD-407. Id from Session-A's
range (B-161–165).

**What happens:** since 2026-09-16 17:00 UTC every automatic class reminder
(`messages.message_type = 'notification_reminder'`, plus a `reminder_attempts` row) has gone out
2–3× to each student, and the retry two hours later is doubled as well.

Production reads (read-only, 2026-09-22 18:59–19:03 UTC), `reminder_attempts` rows / unique
(instance, player, number):
- 1:1 on every day up to 09-15.
- 09-16 28/14 · 09-17 24/12 · 09-18 20/10 · 09-19 15/9 · 09-20 18/6 (3×) · 09-21 24/12 · 09-22 24/12.

The copies share `presence_id` and land 1–1000 ms apart. The class is not duplicated: there is
one instance per occurrence, created at 17:00:0x by the occurrence job. At 18:59 UTC
`apscheduler_jobs` held twin retry jobs for the same second:
`reminder_404_retry_1790103620` and `reminder_lesson_45_2026-09-23_retry_1790103620`.
There was no prod deploy on 09-21, so the cause is steady-state, not deploy-correlated. Only the
prod backend (one gunicorn worker) is connected to `padel_app`.

**What should happen:** each (presence, reminder number) is sent exactly once, however many
passes the scheduler runs for the occurrence.

**Root cause:**
1. The occurrence job (`_run_reminder_for_lesson_occurrence`) materialises the instance.
   `get_or_materialize_instance` then enrols the roster.
2. For each created presence, `enrol()` calls PAD-331's `arm_ask_for_student`. Inside the
   occurrence job the fire time has passed, so `next_ask_time` returns *now*, and one
   `ask_<inst>_<player>` job is armed per student.
3. Each ask job runs `send_class_reminders` over the WHOLE instance, alongside the occurrence
   job's own pass.
4. The only guard is `count_attempts >= reminder_count`: a check, then an insert, with no lock
   and no unique constraint.
5. Concurrently, several passes read the same count and all send the same number. That is the
   prod shape.
6. Sequentially, with `reminder_count = 3`, the extra passes send numbers 2 and 3 within seconds
   instead of hours apart.
7. Each winning runner then re-arms its own retry chain: `reminder_<inst>_retry_*` and
   `reminder_lesson_<L>_<date>_retry_*`.

**Onset:** d83bd9ce2 (PAD-331) is absent from 2e06cfc2e (prod until 09-16) and present in
f34e99ef3 (prod deploy 09-16 10:16–10:30 UTC). The 09-15 17:00 run was clean; the 09-16 17:00
run was doubled. PAD-347 (B-097) fixed a different double (occurrence job + instance job) and
does not cover ask jobs.

**Evidence (2×2):** Session-A's harness, untracked at
`~/levapp-wt-g/backend/padel_app/tests/test_scratch_reminder_double_send.py`, run at 84c125938
on Postgres (7 passed, rc=0, 19:16 UTC). "OLD" monkeypatches `arm_ask_for_student` to a no-op.
"Present" means the occurrence is materialised inside the pass.

| cell | ask jobs armed | sequential final attempts/player | concurrent max rows per (player, number=1), 5 runs |
|---|---|---|---|
| NEW × present | 3 | 3 (numbers 1, 2, 3 within seconds) | 4, 4, 4, 4, 4 |
| OLD × present | 0 | 1 | 1, 1, 1, 1, 1 |
| NEW × absent  | 0 | 1 | — |
| OLD × absent  | 0 | 1 | — |

The control, two bare concurrent `send_class_reminders` calls on OLD code, gives 2 in 5 of 5
runs, so the guard itself is not race-safe.

**Which observation selected the type:** the spec `notifications.reminders` exists and covers
asking late arrivals (PAD-331) and one job per occurrence (rule 20, PAD-347). No rule says that
concurrent or repeated passes for one occurrence send each (presence, number) once, and nothing
separates the roster enrolled by materialisation from a late arrival. So the rule is missing,
not wrong: incomplete-rule.

**Side finding (not this bug):** `notification_service._get_or_create_direct_conversation` is a
check-then-insert. Two passes messaging a student for the first time at the same moment hit
`ix_conversations_participant_key`. It is latent, because prod conversations already exist; it
needs its own ticket.

**Affected specs:**
- Dev: `.specflow/specs/notifications/reminders.spec.md` (rule 21 + 3 criteria, PAD-407)

### Change Plan

Type 2 (incomplete rule), built by Session-C on `feature/pad-407`:
1. Add rule 21 to `notifications.reminders`: a scheduled reminder pass sends each
   (presence, number) once however many passes run concurrently or back to back. The roster
   enrolled by the occurrence's own materialisation is asked by that pass, not by an ask job.
   Name the misfired-job case.
2. Criteria:
   - N concurrent passes → one message per presence;
   - persisted twin retry chains → one follow-up, and the twin chain ends;
   - a late add after the chain still arms an ask.
3. Postgres-only race tests with a forced barrier. They must be red without the lock, without
   the spacing, and without the suppression.
4. Fix, with no migration:
   - `pg_advisory_lock(407, instance_id)` around the pass;
   - scheduled passes skip a student whose latest attempt is younger than
     `hoursBetweenReminders`;
   - `_asks_suppressed()` around materialisation in the occurrence job.
5. Verify in prod after the hotfix: the first 17:00 UTC run gives rows = unique per
   (instance, player, number), and the twin retries that fire send once.

### Resolution

(filled when the hotfix is verified in production)
