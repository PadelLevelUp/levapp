---
id: B-097
title: "A materialised occurrence carries two reminder jobs that fire at the same instant"
type: incomplete-rule
severity: high
status: triaged
affects:
  - notifications.reminders
  - backend/padel_app/scheduler.py
proposed_fix: "One reminder job per occurrence: arming reminder_<instance> cancels reminder_lesson_<lesson>_<date>, and the lesson-occurrence scheduler hands a date that already has an instance to schedule_instance_jobs instead of arming its own job."
opened: 2026-09-16T16:50:00Z
---

# B-097 — A materialised occurrence carries two reminder jobs that fire at the same instant

**Source:** Session H's observation while verifying #257 (PAD-331/318), ticket PAD-347.
Measured by Session B on 2026-09-16 with a scratch pytest that armed both jobs, materialised the
instance and invoked each job's callable with sends recorded. Bug number self-assigned from
Session B's reserved range B-096..B-100 (unconfirmed).

**What happens:** `schedule_lesson_reminder_jobs` arms `reminder_lesson_<lesson>_<date>`
(`scheduler.py:632`) for every occurrence of an active lesson. When the occurrence materialises,
`get_or_materialize_instance` → `_maybe_schedule_instance` → `schedule_instance_jobs` arms
`reminder_<instance>` (`scheduler.py:711`) for the same instant and cancels nothing. Both runners
end in `send_class_reminders(instance.id)`. The only thing between them is the per-(instance,
player) `reminder_attempts` cap:

| `reminder_count` | what the student receives |
| --- | --- |
| 1 (default) | one reminder; the second job sends nothing — redundant job only |
| 2 | two reminders in the same minute (#1 and #2), `hours_between_reminders` collapsed |
| ≥ 3 | two at once, then both runners arm parallel retry chains |

Production copy of 2026-09-16: three coach configs, `reminder_count` 1, 3 and 5 — two of three
coaches exposed.

**Scope is every materialised occurrence, not only one-offs.** `_startup_reschedule` re-arms the
occurrence family for every active lesson and the instance family for every future instance, and
the daily `extend_schedule_window` and every settings save (`reschedule_all_future_jobs`) do it
again, so the pair is re-created on every restart, every day, and every settings change.

**What should happen:** exactly one reminder job per occurrence. The instance job is the truth —
its `start_datetime` survives a single-occurrence edit, whereas the occurrence job's fire time is
derived from the template — so once an instance exists only `reminder_<instance>` may be armed,
and no re-arm path may bring the occurrence job back. The reminder chain (rule 18) keeps
delivering the second and later reminders `hours_between_reminders` apart from the instance
runner.

**Root cause:** `notifications.reminders` rule 1 says "a job per lesson occurrence" and the
scheduler's docstring calls `reminder_<instance>` the runner for "already-materialized
instances", but no rule said the two are exclusive, and no test ran both runners against one
occurrence. Materialisation never cancels the occurrence job; `cancel_lesson_occurrence_job` is
only called on single-occurrence removal.

**Evidence that selected the type:** the scratch run (`scratchpad/pad347/test_pad347_double_reminder.py`)
shows both job ids with one `run_date`, 2 `reminder_attempts` rows and 2 `notification_reminder`
messages for one student with `reminder_count=2`.

**Affected specs:**
- Dev: `.specflow/specs/notifications/reminders.spec.md` (new rule 20, three criteria)
- Business: `.specflow/specs-business/notifications/student-gets-class-reminders.business.md`
  (no drift: it never promised two)

### Change Plan

**Spec to modify:** `.specflow/specs/notifications/reminders.spec.md` — rule 20 + criteria.

**Then:**
1. `schedule_instance_jobs`: after deciding the instance reminder (armed or skipped as past),
   `cancel_lesson_occurrence_job(instance.lesson_id, occ_date)` with
   `occ_date = original_lesson_occurence_date or start_datetime.date()`.
2. `schedule_lesson_reminder_jobs`: a date that already has an instance is handed to
   `schedule_instance_jobs` (canceled/completed instances get no job and any stale occurrence
   job is removed) instead of arming `reminder_lesson_…`.
3. `test_pad347_one_reminder_job_per_occurrence.py`: one job after materialisation, one job after
   the startup/daily re-arm, and with `reminder_count=2` one send per student when every armed
   job runs once, then the second reminder later through the instance runner's retry chain.

### Resolution

- Spec changes: `.specflow/specs/notifications/reminders.spec.md`
- Tests added: `backend/padel_app/tests/test_pad347_one_reminder_job_per_occurrence.py`
- Code changes: `scheduler.schedule_instance_jobs`, `scheduler.schedule_lesson_reminder_jobs`
- Resolved: pending (PAD-347 PR)
