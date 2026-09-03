---
id: notifications.class-reminders-manual
status: implemented
depends_on: [notifications.reminders]
implements: ../../specs-business/notifications/student-gets-class-reminders.business.md
governed_by: []
---

# notifications.class-reminders-manual


### Intent
Coaches manually trigger class reminders (outside the automatic schedule).

### Rules
1. `POST /api/app/notify/send_reminders` with class reference
2. Immediately sends reminders to all enrolled players
3. Uses same reminder flow as automatic reminders
