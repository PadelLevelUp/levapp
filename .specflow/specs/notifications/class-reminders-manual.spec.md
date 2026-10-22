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
4. **Only the class's coach sends its reminders (B-619, R-002).** The route resolves the class through
   the engine's owned resolver: another coach's class is 403, nothing is sent, and a Lesson + date
   ref of another coach's class materialises no occurrence. Before B-619 any coach could push
   reminders to any class by id.

### Acceptance Criteria

#### Another coach cannot send a class's reminders (B-619)
- **Given** coach Ana's class with an enrolled student, and coach Bruno
- **When** Bruno posts `send_reminders` for Ana's class (by its occurrence, or by its lesson and a date with no occurrence yet)
- **Then** the response is 403, no reminder is sent, and no occurrence is created
- **And** Ana's own request for the same class is 200
