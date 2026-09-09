---
id: messaging.push-notifications
status: implemented
depends_on: [messaging.messages, auth.push-subscription]
implements: ../../specs-business/messaging/user-manages-unread-and-notifications.business.md
governed_by: []
---

# messaging.push-notifications


### Intent
Send browser push notifications when a new message arrives and the recipient isn't actively viewing the conversation.

### Rules
1. On message send, `send_push_notification()` called for each recipient
2. Uses VAPID web push (pywebpush library)
3. Notification includes: title (sender name), body (message text), URL (conversation link)
4. Only sent to users with a valid `push_subscriptions` record
5. Native (Expo) message pushes carry `badge` = the recipient's unread message
   total at send time, so the iOS home-screen icon badge matches the in-app
   unread count. The count is the recipient's real total, not an increment, so
   the badge self-corrects after an undelivered push
6. Both clients keep the app-icon badge in sync with the unread count while
   running — iOS via `setBadgeCountAsync`, installed web via the Badging API —
   and clear it on logout. A notification payload is never the only writer of
   the badge: without a client-side writer a stale badge can never be cleared
   (PAD-147). **The client writes the badge on every successful fetch of the
   unread count, not only when the value changes** (PAD-147 follow-up): an
   APNs payload can set the icon badge while the app is closed, and the next
   fetch may return the same number the app already held (typically 0, when
   the message was read on another device, or when a cold launch opened the
   thread before the count was ever observed). A value-change gate skips that
   write and the badge lingers; writing on every fresh answer — after a
   mark-read invalidation, on foreground refetch, and on the first fetch of a
   cold launch — makes the icon equal the server count at every observation
7. **Tap-routing contract (PAD-240).** A native push's `data` names where a tap
   lands: `{type: "message", conversationId}` opens the conversation thread,
   `{type: "class", classInstanceId}` opens the class. **Every push that
   announces a `Message` row is a message notification** — direct messages and
   all system messages alike (invitations, reminders, spot filled, waiting-list
   offers, cancellations to the coach) — because the thing the user acts on
   (the Yes/No answer, the reply, the cancellation text) lives in the thread.
   Such a push carries `type: "message"` plus `conversationId`, and may add
   `classInstanceId` as secondary context; it never routes to the class. The
   `class` type is reserved for pushes that are not backed by a message. A
   client must never route on `classInstanceId` alone: the mobile class screen
   rebuilds its event from route params (`model`, `originalId`, `date`) that a
   push cannot carry, so a `/class/<id>` deep link from a push renders "this
   class could not be found" — the PAD-240 defect

### Acceptance Criteria

#### Tapping a message notification opens the thread (PAD-240)
- **Given** a student with a registered iOS device token who receives a class invitation, a reminder, or a direct message
- **When** the push is sent
- **Then** its `data` is `{type: "message", conversationId: <the thread's id>}`, with `classInstanceId` present only as extra context on class-backed system messages
- **And** tapping the notification on iOS opens `/conversation/<conversationId>`, never `/class/<id>`
- **And** a coach's cancellation notice push routes the same way, to the coach–student thread

#### The app icon badge always equals the server unread count (PAD-147)
- **Given** the iOS icon badge shows 1 because a push arrived while the app was closed
- **When** the user reads that message on another device and then foregrounds the app, so the unread count fetch returns 0 — the same value the app last held
- **Then** the app still writes 0 to the icon badge on that fetch and the badge clears
- **And** reading a conversation in-app (which invalidates the unread count) and a cold launch both end with the badge equal to the fetched count, even when unchanged
- **And** the badge is never written from a pending or failed fetch, and is cleared on logout
