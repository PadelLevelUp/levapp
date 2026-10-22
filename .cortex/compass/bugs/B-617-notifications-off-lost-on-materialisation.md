---
id: B-617
title: "A class created with notifications off had its occurrences materialised with notifications on, and the engine invited for it"
type: incomplete-rule
severity: high
status: resolved
resolved: 2026-10-22T02:40:00Z
affects:
  - backend/padel_app/services/lesson_service.py
  - .specflow/specs/notifications/toggle-class.spec.md
proposed_fix: "create_lesson_instance_helper sets the copied notifications_enabled on the instance after the form layer."
opened: 2026-10-22T02:30:00Z
---

# B-617: notifications off lost when an occurrence is materialised

**Source:** session D's PAD-672 S1 E2E fixture (2026-10-22): a class created with
`notificationsEnabled: false` sent an invitation after a student's cancellation materialised it.

**What happened:** `add_class` stores the flag on the Lesson. `create_lesson_instance_helper` copies
it into the instance data (`Lesson.data_for_instance`), but the form adapter drops a `False`
boolean (the PAD-367 family), so the new LessonInstance took the column default `True`. The engine
reads `instance.notifications_enabled`, so a coach's "off" stopped holding the first time anything
materialised the occurrence — for a one-off class and for a series' later occurrences alike.
`auto_invites` / `open_spots_visible` are unaffected: resolved through instance → lesson tiers at
read time.

**Evidence:** `test_notifications_off_survives_materialisation.py`: the two `off` cells (one-off,
series) red on staging fe18046a2 (`instance.notifications_enabled` True), the two `on` controls
green; all four green after the fix.
