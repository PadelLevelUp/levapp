---
id: B-620
title: "PAD-736: a class with notifications off still sent its reminders"
type: incomplete-rule
severity: high
status: resolved
resolved: 2026-10-22T16:30:00Z
affects:
  - backend/padel_app/services/notification_service.py
  - backend/padel_app/services/past_due_service.py
  - .specflow/specs/notifications/toggle-class.spec.md
proposed_fix: "A scheduled send_class_reminders pass returns nothing sent for an occurrence whose notifications_enabled is off, and the past-due listing skips such classes; the coach's own send still goes out (toggle-class rule 3)."
opened: 2026-10-22T09:00:00Z
---

# B-620: reminders went out on a class with notifications off (PAD-736)

**Source:** session C, while fixing B-618 (PAD-732). Toggle-class rule 3 said a class with
notifications off gets no reminders; the reminder path never read the switch. 41 lessons in prod had
the switch off at the time.

**What happened:** `send_class_reminders` checked the occurrence's status, start and roster, never
`notifications_enabled`. The scheduler's jobs, the past-due "send now" and the coach's "Enviar
lembretes" all asked the students of a class the coach had switched off. The past-due listing also
offered those classes.

**Decision (owner, 2026-10-22):** off means off for the automatic reminders: the scheduler's passes
and the past-due "send now". The coach's own "Enviar lembretes" is an explicit send and still goes
out, like a manual invitation (rule 3b, B-618).

**Evidence:** `test_pad736_no_reminders_on_a_notifications_off_class.py`, 6 tests. Four are red on
staging 6e1cd8e1c: two because a scheduled pass reminded the off class (alone, and after a manual
invitation), two because the past-due listing offered the off class. The on-class and coach-send
controls are green both ways.

**Not covered here:** switching a series off does not reach occurrences already materialised; they
keep their own value. Noted on PAD-736 as a follow-up for the owner.
