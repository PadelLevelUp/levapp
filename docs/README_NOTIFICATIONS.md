# Automatic Notifications Feature

## Overview

The Notification Engine is an automated invite system that fills open spots in padel classes when a registered player is marked absent. When attendance is confirmed, the system automatically contacts a ranked list of substitute players via in-app chat messages and Web Push notifications. Players respond with Yes or No buttons, and the system handles roster updates, confirmations, and cascaded rejections automatically.

There are two operational modes:
- **Automatic**: triggered by the attendance flow, no coach intervention needed
- **Manual**: the coach opens a class and selects which players to invite

---

## How It Works — End-to-End Flow

### 1. Trigger (Automatic Mode)

The flow starts in the attendance confirmation step.

**File:** `levelup_backend/padel_app/modules/frontend_api.py` (line ~631)

When a coach confirms presences for a class, `confirm_presences_service()` calls `trigger_auto_notifications(instance, coach_id)`. This only proceeds if:

- `auto_notify_enabled` is `True` in the coach's config
- `instance.notifications_enabled` is `True` for that specific class
- There are open spots in the class
- Current restrictions allow sending (quiet hours, minimum time before class, max total invites)

### 2. Student Ranking

**File:** `levelup_backend/padel_app/services/notification_service.py` — `get_eligible_students()`

Before sending, the engine builds a ranked list of eligible students based on the coach's configured priority criteria. Students already in the class or already notified are excluded.

Ranking criteria (each can be toggled on/off):

| Criterion | Description |
|-----------|-------------|
| `level` | Students whose level matches or is close to the class level (sorted by `display_order`) |
| `justified_misses` | Students with a higher ratio of justified absences are prioritized |
| `attendance` | Students with higher overall attendance rate are prioritized |
| `playing_side` | Matches preferred playing side (left/right) to class needs |
| `subscription_status` | Active subscribers are ranked above inactive |

### 3. Sending — Round 1

**File:** `levelup_backend/padel_app/services/notification_service.py` — `trigger_auto_notifications()`

Round 1 is sent immediately. The system:
1. Takes the top `maxSimultaneous` students from the ranked list
2. Sends each an invite as a direct chat message (type `notification_invite`)
3. Simultaneously sends a Web Push notification
4. Creates a `NotificationEvent` record (status: `sent`, type: `auto`)

### 4. Queued Rounds (Round 2, 3, …)

Subsequent rounds are not sent immediately. A `NotificationEvent` with status `queued` is created for each round. A cron job (or manual API call) calls `process_queued_rounds()`, which:

1. Checks if the spot is still open
2. Checks that per-student daily limits are respected
3. Fires the next batch of invites if the round duration has elapsed

**File:** `levelup_backend/padel_app/services/notification_service.py` — `process_queued_rounds()`

Default rounds:

| Round | Duration | Description |
|-------|----------|-------------|
| 1 | immediate | Top-ranked students |
| 2 | 10 min | Next in ranking |
| 3 | 10 min | Next in ranking |
| 4 | 15 min | Remaining eligible students |

### 5. Student Response

**File:** `levelup_frontend/src/components/messages/MessageBubble.tsx`

Invite messages are rendered in the chat UI with **Yes** and **No** buttons. When a student responds:

**File:** `levelup_backend/padel_app/services/notification_service.py` — `respond_to_notification()`

| Response | Action |
|----------|--------|
| Yes | Player added to lesson roster; confirmation message sent; all other pending invitees receive a "spot filled" message and their events are marked `expired` |
| No | Decline message sent; `NotificationEvent` marked `expired` |
| Spot filled by another | "Spot filled" message broadcast to all remaining pending invitees |

---

## Manual Notifications

**File:** `levelup_frontend/src/components/calendar/ManualNotificationModal.tsx`

In the Class Detail sheet, the coach clicks **Notify**. A modal opens with four pre-configured student groups:

| Group | Criteria |
|-------|----------|
| Same level | Students whose level matches the class |
| Recent absences | Students absent in the last 8 classes |
| Justified absences | Students with at least one justified absence |
| All students | All students registered under the coach |

The coach can also search by name and select students individually. Clicking **Send** calls the manual notifications endpoint.

**File:** `levelup_backend/padel_app/services/notification_service.py` — `send_manual_notifications()`

---

## Configuration

Settings are accessible from the Settings page, Notifications section.

**Frontend:** `levelup_frontend/src/components/settings/NotificationsEngineSection.tsx`
**Backend model:** `levelup_backend/padel_app/models/notification_config.py`
**Backend service:** `levelup_backend/padel_app/services/notification_service.py` — `update_config()`

### Master Toggle

`autoNotifyEnabled: boolean` — Enables or disables the entire automatic engine. Manual sending is unaffected.

### Priority Criteria

Defines which factors are used to rank eligible students and in what order (drag-to-reorder in the UI).

**File:** `levelup_frontend/src/components/settings/NotificationsEngineSection.tsx`

```json
[
  { "id": "level",               "enabled": true },
  { "id": "justified_misses",    "enabled": true },
  { "id": "attendance",          "enabled": true },
  { "id": "playing_side",        "enabled": false },
  { "id": "subscription_status", "enabled": false }
]
```

### Restrictions

**File:** `levelup_frontend/src/components/settings/RestrictionsPanel.tsx`

| Setting | Default | Description |
|---------|---------|-------------|
| `maxSimultaneous` | 3 | Max students invited per round |
| `maxTotal` | 10 | Max total invites sent per class instance |
| `maxLevelDeviation` | 1 | Max level steps away from the class level |
| `minTimeBeforeClass` | 30 min (disabled) | Stop sending invites this many minutes before the class starts |
| `maxInvitesPerStudentPerDay` | 3 (disabled) | Max invites a single student can receive in one day |
| `quietHours` | disabled | No invites sent between 22:00 and 07:00 |

### Notification Rounds

**File:** `levelup_frontend/src/components/settings/NotificationRounds.tsx`

Each round can have its duration (in minutes) configured. Rounds represent successive waves of invites sent to the next batch of ranked students.

### Notification Groups (Manual Mode)

**File:** `levelup_frontend/src/components/settings/NotificationGroupsSection.tsx`

Controls which of the four pre-configured groups are shown in the Manual Notification modal.

### Message Templates

**File:** `levelup_frontend/src/components/settings/MessageTemplatesSection.tsx`

Four templates, each supporting interpolation variables:

| Template | Sent when | Available variables |
|----------|-----------|---------------------|
| `invite` | Initial invite | `{name}`, `{level}`, `{weekday}`, `{time}` |
| `confirm` | Student accepts | — |
| `decline` | Student declines | — |
| `spot_filled` | Another student already accepted | — |

**Default invite template:**
> "Hey {name}, we have an opening in the {level} class next {weekday} at {time}. Do you want to come?"

### Per-Class Toggle

Each class (lesson instance) has an individual `notifications_enabled` flag that overrides the global setting for that specific occurrence. Toggled from the Class Detail sheet.

**Frontend:** `levelup_frontend/src/components/calendar/ClassDetailSheet.tsx` (line ~291)
**Backend model field:** `levelup_backend/padel_app/models/lesson_instances.py` (line ~32)

---

## API Endpoints

**File:** `levelup_backend/padel_app/modules/notification_engine_api.py`

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/app/notify/config` | Fetch the coach's notification config |
| `POST` | `/api/app/notify/config` | Save updated config |
| `POST` | `/api/app/notify/toggle_class` | Toggle notifications on/off for a specific class |
| `POST` | `/api/app/notify/manual` | Send manual notifications to selected players |
| `GET` | `/api/app/notify/groups` | Get pre-configured student groups for the manual modal |
| `GET` | `/api/app/notify/activity` | Fetch recent notification activity (dashboard widget) |
| `POST` | `/api/app/notify/respond` | Player submits a Yes/No response to an invite |
| `POST` | `/api/app/notify/coach_respond` | Coach manually records a player response |
| `POST` | `/api/app/notify/process_rounds` | Process queued notification rounds (called by cron) |

**Web Push endpoints — File:** `levelup_backend/padel_app/modules/notifications_api.py`

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/notifications/vapid-public-key` | Returns the VAPID public key for push subscription |
| `POST` | `/api/notifications/save-subscription` | Register (upsert) a browser push subscription |
| `DELETE` | `/api/notifications/unsubscribe` | Remove a push subscription |

---

## Database Models

**File:** `levelup_backend/padel_app/models/notification_config.py`

```
NotificationConfig
  id
  coach_id (unique)
  auto_notify_enabled    Boolean
  priority_criteria      JSON
  restrictions           JSON
  rounds                 JSON
  notification_groups    JSON
  message_templates      JSON
```

**File:** `levelup_backend/padel_app/models/notification_event.py`

```
NotificationEvent
  id
  coach_id
  lesson_instance_id
  player_id
  type                   Enum["manual", "auto"]
  round_number           Integer
  status                 Enum["sent", "confirmed", "expired", "queued"]
  message_id             FK → Message
  created_at
  updated_at
```

Each notification creates one `NotificationEvent`. The `message_id` links to the actual chat message that delivered the invite, keeping the notification record in sync with the conversation state.

---

## Web Push Delivery

**Frontend:** `levelup_frontend/src/utils/pushNotifications.ts`
**Backend:** `levelup_backend/padel_app/utils/push_notifications.py`
**Service worker:** `levelup_frontend/public/sw.js`

The system uses the Web Push API with VAPID authentication. When a player is not actively viewing the app, a push notification is delivered to their browser (or mobile PWA). Invalid subscriptions (HTTP 404 / 410 responses from the push service) are automatically deleted from the database.

---

## Real-Time Updates (SSE)

When notifications are sent or a player responds, the backend publishes Server-Sent Events that update connected clients without a page reload:

| Event | Triggered when |
|-------|---------------|
| `notify_sent` | A batch of invites is dispatched |
| `notification_responded` | A player submits a Yes/No response |
| `message_edited` | A message's metadata is updated (e.g., response recorded) |

---

## Dashboard Activity Feed

**File:** `levelup_frontend/src/components/dashboard/blocks/NotificationActivityBlock.tsx`
**Backend:** `levelup_backend/padel_app/services/notification_service.py` — `get_notification_activity()`

A dashboard widget shows the coach a recent log of all notification events: student name, class title, type (manual/auto), round number, and current status (sent, confirmed, expired, queued).

---

## Frontend API Client

**File:** `levelup_frontend/src/api/notificationEngine.ts`

Exports eight functions that map to the backend endpoints:

- `getNotificationConfig()`
- `saveNotificationConfig(config)`
- `toggleClassNotifications(instanceId, enabled)`
- `sendManualNotifications(instanceId, playerIds)`
- `getNotificationGroups(instanceId)`
- `getNotificationActivity()`
- `respondToNotification(eventId, response)`
- `coachRespondToNotification(eventId, response)`

---

## E2E Tests

**File:** `levelup_frontend/e2e/notification-engine/notification-config.spec.ts`

Covers:
- US-52: Notification config accessible from class detail sheet
- US-53: Advanced configuration options (priority, restrictions, rounds) exist and are editable
- US-54: Student notification groups are configurable
- US-55: Message templates are customizable with variable support
- US-56: Manual send invitation button present in class detail sheet
