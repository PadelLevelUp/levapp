---
id: messaging.push-notifications
status: implementing
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
   the badge self-corrects after an undelivered push. **This covers every
   message-backed push** (PAD-147): the notification engine's system messages
   (invitations, reminders, spot filled, waiting-list offers) and the
   cancellation notice to the coach are unread `Message` rows exactly like a
   direct message, so their pushes carry the same `badge`; a push without it
   leaves the icon under-counting until the app is next opened
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
8. **Push permission never gates the in-app feed (PAD-195).** *(Numbered 8: PAD-240's
   tap-routing rule takes 7 on its own branch, so a batch merge does not produce two 7s.)* The browser's (or
   the device's) notification permission decides only whether the OS shows an
   alert while the app is closed. The conversation list, the SSE live updates,
   the in-app message rows and the unread badge are served by the backend and
   keep working with permission denied or never asked. The "blocked" banner on
   the Messages page therefore says exactly that — browser/device alerts are
   off and where to turn them on — and states that messages and the badge
   still arrive in the app; copy that reads as "notifications are off" for the
   whole app is the PAD-195 defect (a coach with push blocked believed the app
   had stopped notifying them)
9. **Native device tokens are owned per (user, token) (PAD-269).** `POST /api/notifications/device`
   `{token, platform}` (JWT) records the pair (caller, token) once. `device_tokens` is unique on
   `(user_id, token)`, and the route never touches another user's row, so posting someone else's
   Expo token no longer takes their notifications away (it used to reassign the row to the
   caller). `DELETE /api/notifications/device` `{token}` removes only the caller's row and is
   idempotent. An Expo `DeviceNotRegistered` receipt deletes every row holding that token. The
   iOS app unregisters its token on logout, so a shared phone stops getting the previous user's
   pushes.

### Acceptance Criteria

#### Tapping a message notification opens the thread (PAD-240)
- **Given** a student with a registered iOS device token who receives a class invitation, a reminder, or a direct message
- **When** the push is sent
- **Then** its `data` is `{type: "message", conversationId: <the thread's id>}`, with `classInstanceId` present only as extra context on class-backed system messages
- **And** tapping the notification on iOS opens `/conversation/<conversationId>`, never `/class/<id>`
- **And** a coach's cancellation notice push routes the same way, to the coach–student thread

#### The feed works with browser push denied (PAD-195)
- **Given** a signed-in coach whose browser notification permission is `denied`
- **When** they open the Messages page
- **Then** the conversation list renders, and the banner names browser alerts only and says messages and the badge still arrive in the app
- **And** when a student sends them a message, it appears in the list and the nav unread badge shows, live over SSE, without a reload
- **And** iOS shows the equivalent copy for a device-level denial

#### The app icon badge always equals the server unread count (PAD-147)
- **Given** the iOS icon badge shows 1 because a push arrived while the app was closed
- **When** the user reads that message on another device and then foregrounds the app, so the unread count fetch returns 0 — the same value the app last held
- **Then** the app still writes 0 to the icon badge on that fetch and the badge clears
- **And** reading a conversation in-app (which invalidates the unread count) and a cold launch both end with the badge equal to the fetched count, even when unchanged
- **And** the badge is never written from a pending or failed fetch, and is cleared on logout

#### Another user's device token is never taken over (PAD-269)
- **Given** user `ana` registered the Expo token `ExponentPushToken[abc]`
- **When** user `bruno` POSTs the same token to `/api/notifications/device`
- **Then** `ana`'s row is unchanged and `bruno` has a row of his own for that token
- **And** `bruno` posting it again still leaves exactly one row for the pair
