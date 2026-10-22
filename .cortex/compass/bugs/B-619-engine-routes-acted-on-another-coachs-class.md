---
id: B-619
title: "Engine routes sent reminders to, and materialised occurrences of, another coach's class"
type: incomplete-rule
severity: high
status: resolved
resolved: 2026-10-22T11:30:00Z
affects:
  - backend/padel_app/modules/notification_engine_api.py
  - .specflow/specs/notifications/class-reminders-manual.spec.md
  - .specflow/specs/eligibility/enforcement.spec.md
proposed_fix: "One owned resolver (_resolve_owned_instance) checks the lesson before materialising and the occurrence after, for send_reminders, eligibility_check, manual, class_waiting_list and the invite simulation."
opened: 2026-10-22T10:10:00Z
---

# B-619: engine routes acted on another coach's class

**Source:** session G's security review (2026-10-22); fixed by session C.

**What happened:** `POST /api/app/notify/send_reminders` took any coach profile, resolved the class
by `{model, originalId, date}` and called `send_class_reminders` with no ownership check. Any coach
could push reminders to another coach's students by sequential id (R-002; a family-2 extra send).

`POST /notify/eligibility_check` had no check either. On a Lesson + date ref it materialised a
LessonInstance on another coach's virtual occurrence before answering.

The sweep of the file found three more routes that did check, but only after `_resolve_instance`,
so they materialised a foreign occurrence before refusing: `/manual` (403), `/class_waiting_list`
(403) and the invite simulation (404).

**Fix:** `_resolve_owned_instance(coach, …, refusal=403|404)` checks `coach_owns_lesson` before
materialising a Lesson + date ref, then `coach_owns_instance` on the result (PAD-275 rule 4). All
five routes go through it. Each keeps its status: 403, and 404 for the simulation, whose contract
hides the class. The routes addressed by instance id (`waiting_list/<id>`, `approval/instance/<id>`)
were already scoped by coach in their services.

**Evidence:** `test_b619_engine_routes_check_ownership.py`, 10 tests. Seven are red on staging
9efef829c: two foreign 403s, and five "no occurrence created" (send_reminders, eligibility_check,
manual, class_waiting_list, simulation). All ten pass after the fix. The owner controls (200 on
both routes, and the owner's Lesson + date still materialising) are green before and after.
