---
id: B-441
title: "Dashboard offered \"Vou\" from enrolment: pendingConfirmation read `invited`, which enrol() writes on day one, while the class detail never offered it"
type: layer-drift
severity: high
status: resolved
affects:
  - attendance.confirm
  - dashboard.blocks
  - backend/padel_app/helpers/dashboard/player_home.py
  - backend/padel_app/helpers/dashboard/kpis.py
  - backend/padel_app/services/notification_service.py
proposed_fix: "One server predicate (`student_may_confirm`, attendance.confirm rule 27) served as `pendingConfirmation` on the class detail and every dashboard surface; `invited` is not read; `respond_reminder` refuses an early yes."
opened: 2026-10-09T18:30:00Z
resolved_in: PAD-570
---

# B-441: the dashboard asked "Vou?" from enrolment; the class detail never asked at all

**Source:** PAD-570 (owner, 2026-10-09). "Painel: aparecem confirmações ('Vou') muito antes do
lembrete, em vários sítios: cartão 'Próxima aula', 'Precisa de ti', 'Próximas aulas'."

**What was wrong:** `enrol()` (`lesson_service.py`) writes `invited=True, confirmed=False` on every
presence row it creates, and three dashboard readers — `_pending_instance_ids` (rows and hero),
`_invite_items` ("Precisa de ti") and the Invites KPI — treated `invited and not confirmed` as
"asked and unanswered" (dashboard.blocks rule 3a as written by PAD-202). So a student was shown
Yes / No the moment they were put on a class, days before the coach's first reminder, and the
"Precisa de ti" queue nagged them about every future class. The class detail, meanwhile, offered
only the decline (PAD-313 rule 25) plus the PAD-315 come-back; two surfaces, two rules.

**Why layer-drift:** the business rule — a student may confirm only once the coach asked, so the
coach has time to find a replacement — was never written down; `notifications.reminders` rule 4
("players respond: confirm or decline") was read as "at any time". The dev layer encoded a column's
accident (`invited` at enrolment) as the ask.

**Fix (PAD-570):** one predicate, `student_may_confirm` (attendance.confirm rule 27): the first-
reminder instant has passed — the same `_fire_time_utc` boundary as the proactive-decline window —
or a counted reminder was actually sent; the occurrence's notifications are on; the row is
`planned`; the class has not started. Served as `pendingConfirmation` everywhere, enforced by
`respond_reminder` (`not_yet_asked`), and the dashboard tile counts the same list the queue shows.

**Guard:** `backend/padel_app/tests/test_pad570_vou_after_reminder.py` pins both sides of the
instant on every surface; `test_dashboard_player_home.py` no longer reads `invited` as the ask.
