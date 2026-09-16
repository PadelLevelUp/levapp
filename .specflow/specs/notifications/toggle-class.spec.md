---
id: notifications.toggle-class
status: implemented
depends_on: [notifications.config, classes.instances]
implements: ../../specs-business/notifications/coach-tunes-the-invitation-engine.business.md
governed_by: []
---

# notifications.toggle-class


### Intent
Toggle notification engine on/off for a specific class.

### Rules
1. `POST /api/app/notify/toggle_class` with class reference
2. Updates `notifications_enabled` on the Lesson or LessonInstance
4. **Owner only (PAD-258).** The caller must own the Lesson/LessonInstance (`coach_owns_lesson` /
   `coach_owns_instance`, PAD-92) — 403 otherwise, flag untouched.
3. When disabled, no reminders or auto-invitations fire for that class

### Notes
- Secondary outcome: this switch is read by both the reminder scheduler and the invitation engine —
  see `notifications.student-gets-class-reminders` and
  `notifications.coach-fills-vacancies-automatically`.
