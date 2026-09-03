---
id: dashboard.blocks
status: implemented
depends_on: [classes.instances, messaging.conversations, notifications.activity, players.list]
implements: ../../specs-business/dashboard/coach-relies-on-dashboard.business.md
governed_by: []
---

# dashboard.blocks


### Intent
Render a server-driven dynamic dashboard with configurable blocks for coaches and players.

### Rules
1. `GET /api/app/dashboard?from=ISO&to=ISO` returns `DashboardDefinition`
2. Definition contains ordered `blocks[]`, each with a type
3. Block types:
   - `messages_overview`: unread count, conversations to reply, latest message, link to messages
   - `kpi_grid`: 4-item grid (total players, weekly classes, attendance rate, etc.)
   - `class_list`: upcoming classes with title, date, time, color, participant count
   - `notification_activity`: recent notification events
   - `grid`: layout container with responsive columns and child blocks
4. Frontend `DashboardRenderer` switches on block type
5. Coach and player get different dashboard payloads
6. **(PAD-144)** The coach's *pending confirmations* set covers **tomorrow's** classes, where
   "tomorrow" is the next **club-local calendar day** (`Europe/Lisbon`) — the day the coach sees on
   their own calendar, consistent with `calendar` rule 6 and `notifications.config` rule 6b. The
   half-open `[start, end)` window must be derived in club-local time and converted back to naive
   UTC to compare against `LessonInstance.start_datetime` (stored naive UTC). A bare
   `.replace(hour=0, ...)` on a naive-UTC instant pins the window to UTC midnight, which in
   Portuguese summer time shifts it an hour: a class at 00:30 local tomorrow is excluded while one
   at 00:30 local *today* is wrongly included.
7. **(PAD-144)** Rule 6 governs more than a count. The same window selects the targets of
   `notify_pending_confirmations`, which actually **sends** messages, so a misaligned boundary does
   not merely misreport a number — it nudges the wrong students about the wrong day's classes.

### Acceptance Criteria

#### Coach dashboard
- **Given** an authenticated coach with 15 players, 3 classes this week, 2 unread messages
- **When** they GET `/api/app/dashboard`
- **Then** the response includes blocks: messages_overview (2 unread), kpi_grid (15 players), class_list (3 classes)

#### Player dashboard
- **Given** an authenticated player enrolled in 2 classes this week
- **When** they GET `/api/app/dashboard`
- **Then** the response includes their enrolled classes
