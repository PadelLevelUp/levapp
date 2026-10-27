---
id: B-690
title: "A semi-automatic decline that landed while the class's approval job was running never got its prompt: the scheduler skipped the re-armed job"
type: incomplete-rule
severity: medium
status: resolved
affects:
  - notifications.invitations
  - backend/padel_app/scheduler.py
  - backend/padel_app/services/replacement_approval_service.py
proposed_fix: "Invitations rule 1b: one approval job per vacancy (approval_now_<instance>_<vacancy>), each asking for its own vacancy, so a decline during a running job runs its own."
opened: 2026-10-27T20:00:00Z
resolved: 2026-10-27T21:00:00Z
---

# B-690: decline during a running approval job lost its prompt

**Source:** code reading at main 9c62d538d during the investigation of the class in the owner's
screenshots (that class was B-688, not this). Linear PAD-764. Not observed on prod: 0 log lines
"maximum number of running instances" since the PAD-733 deploy (SessionH, read-only).

**What happens:** PAD-733 (#855) armed one job per class, `approval_now_<instance>`, which read the
class's pending vacancies once when it started. A second decline while it ran re-armed the same id;
APScheduler skips a run whose id already has one running (max_instances 1) and drops a one-shot
job. The second vacancy stayed pending with no prompt; the sweep skips pending spots and
invite_start fires once, so nothing asked again.

**What should happen:** every semi-automatic decline's spot gets its prompt.

**Root cause:** rule 1b said "one id per class, so declines seconds apart share one bundle" and
stated nothing for a decline during a running job (incomplete rule).

**Fix:** rule 1b, one job per vacancy (`create_vacancy_approval_prompt`).
Test: `backend/padel_app/tests/test_pad764_decline_during_a_running_approval_job.py` (red on
9c62d538d with APScheduler's skip warning in the log).
