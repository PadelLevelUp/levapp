---
id: notifications.activity
status: implemented
depends_on: [notifications.invitations]
implements: ../../specs-business/notifications/coach-relies-on-notifications.business.md
governed_by: []
---

# notifications.activity


### Intent
Display a feed of notification events for the coach to track invitation history.

### Rules
1. `GET /api/app/notify/activity` returns NotificationEvent history for the coach
2. Each event includes: type, round_number, status, created_at, lesson instance info, player info
3. Displayed on dashboard (NotificationActivityBlock) and settings page
