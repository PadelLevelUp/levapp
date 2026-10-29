---
id: B-709
title: "A \"this and following\" save of a class's notifications switch changed the series only; the occurrence on screen kept its old value"
type: incomplete-rule
severity: high
status: open
affects:
  - backend/padel_app/services/lesson_service.py
  - backend/padel_app/scheduler.py
  - .specflow/specs/notifications/toggle-class.spec.md
  - .specflow/specs/classes/edit.spec.md
proposed_fix: "The future-scope edit sets notifications_enabled on every occurrence the series walk reaches, on the LessonInstance and Lesson paths."
opened: 2026-10-29T20:50:00Z
---

# B-709: a series save of the notifications switch never reached the materialised occurrence

**Source:** PAD-793 (owner, 2026-10-29). A private series showed "Notificações automáticas" off,
the student got no reminder, and switching it on and saving answered "Alterações guardadas" while
the switch came back off.

**What happened:** two defects met on one class.

1. *Why the occurrence was off.* The series was created on 13/10 with `notifications_enabled`
   false. Both create forms send off by default: web `AddClassSheet` starts at `false` and shows the
   switch only when the coach's engine is on; iOS `class/new` always sends `false` and has no
   switch. Before PAD-729 (B-617, prod 22/10) materialisation dropped the `false`, so the earlier
   occurrences were on and reminded. The occurrence materialised on 23/10 copied the series'
   `false`, and the scheduled pass skipped it (toggle-class rule 3). PAD-729 is correct; it exposed
   the client default.
2. *Why the save did not stick (this entry).* With scope `future`, `edit_class_service` wrote
   `notificationsEnabled` to the series only. `_edit_future_instances_for_lesson` carries
   `_EDIT_CLASS_FIELDS`, which does not hold the switch, so the materialised occurrences kept their
   value. The class detail reads the occurrence's own flag, which is NOT NULL and never inherits
   (unlike `auto_invites` / `open_spots_visible`), so the switch showed off after a successful save.

**Side defect, same path:** after a pass skipped for "notifications off", the scheduler still logged
"Reminder sent for instance N". That made the skip read as a send in the log.

**Evidence (prod, ids only, read-only, 2026-10-29):**
- Series 138 was forked into lesson 158 at 20:31:28Z. Both saves were `POST /api/app/edit_class` and
  answered 201, the future-scope return.
- Lesson 158 is on; occurrence 596 is off.
- At 17:00:00Z the log reads "instance 596 notifications off — skipping".
- The student was reminded only by the coach's manual "Enviar lembretes" at 20:33:21Z.

**Survey:**
- 10 running recurring lessons are off, and 36 of their occurrences created before 22/10 were on.
- 4 future occurrences are off whose series used to remind: 636, 640, 593, 639.
- No data was changed; the backfill is the owner's decision.

**Test:** `test_pad793_future_edit_reaches_occurrences.py`: 6 cells red on staging 3404796a9 (the
occurrences unchanged), and 1 control green (an edit without the switch leaves them alone).
