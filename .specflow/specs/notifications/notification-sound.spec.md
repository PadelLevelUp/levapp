---
id: notifications.notification-sound
status: implementing
depends_on: [messaging.sse-realtime, messaging.push-notifications, settings.profile]
implements: ../../specs-business/messaging/user-manages-unread-and-notifications.business.md
governed_by: []
---

# notifications.notification-sound

> Linear: PAD-680 (reported by a coach via Discord). Shape approved by the coordinator, 2026-10-21.
> PAD-743 (2026-10-23): rule 5 sounds every iOS push, not only a declaring build's.

### Intent
A short sound tells the user that a message or a system notification (an invitation, a reminder, a
request alert) has arrived while the app is open, so they don't have to keep checking. One setting
turns it off.

### Entities
- **READS / WRITES:** User (`notif_sound`), DeviceToken (`sound_capable`)

### Rules
1. **One per-user switch, on by default.** `users.notif_sound` (boolean, default true) is
   `notificationSound` on `GET`/`PATCH /api/auth/me`; a non-boolean value is a 400. Settings →
   Preferences shows it on web and iOS ("Som das notificações" / "Notification sound") next to
   request alerts, saved with the section's Save like the others.
2. **What sounds: a message from someone else.** Every system notification a person receives in the
   app arrives as a message in a conversation (the engine's invitations and reminders, request and
   class-request alerts, profile prompts — each published as `message_created`). So the sound is
   tied to `message_created` whose `senderId` is not the signed-in user. Status events
   (`notify_sent`, `notification_responded`, `join_request_created`, `class_request_changed`, …)
   accompany such a message or only refresh lists, so they never sound: one arrival, one sound.
3. **Web.** The tab's one SSE listener (`AppLayout`, `messaging.sse-realtime` rule 15) plays a short
   synthesized chime (Web Audio, no audio file, no third-party host) when rule 2 holds and the
   switch is on, unless the page is visible, focused and showing that same conversation. Several
   messages within 2 seconds play one chime.
   **Browser limit (autoplay):** browsers only let a page make sound after the person has
   interacted with it (a click, a tap or a key) since it was loaded. Until then the chime is skipped
   silently; it is not queued. A tab that was opened and never touched stays silent; that is the
   browser's rule, not a setting. Web push notifications sound as the operating system decides.
4. **iOS, foreground.** The notification handler plays the system sound for a push that arrives
   while the app is open (`shouldPlaySound`) when the signed-in user's switch is on, and stays
   silent when it is off (older builds' handler never plays one). The app keeps no audio dependency: a message that arrives over SSE
   without a push makes no sound (an in-app sound would need a native audio module and a new
   binary; out of scope).
5. **iOS, background (the payload): every iOS token while the switch is on** (PAD-743, owner
   decision 2026-10-23, amending PAD-680's capability gate). An Expo push to a token registered
   with `platform: "ios"` carries `sound: "default"` while the recipient's switch is on and the
   capability is not switched off (PAD-533, the operator's off-switch for the payload sound), whatever
   build registered the token. So App Store 1.3.1 (33) and older sound too: those builds asked iOS
   for the sound permission (`requestPermissionsAsync()` with no options requests alert, badge and
   sound), and their users switch it off from web Settings → Preferences, which governs every device,
   or per app in iOS Settings. A token with no recorded platform (registered before PAD-307, when only
   the iOS app sent pushes) counts as iOS. Every other platform (Android) keeps PAD-680's gate:
   `sound` only to a token whose build declared `notification-sound` (`X-LevApp-Capabilities`,
   PAD-352) when it registered (`POST /api/notifications/device`, on every app start); the server
   keeps that on the token (`device_tokens.sound_capable`) for every platform.

### Acceptance Criteria

#### The switch defaults on and is saved (rule 1)
- **Given** a new user
- **Then** `GET /api/auth/me` answers `notificationSound: true`
- **When** they `PATCH` `{"notificationSound": false}` **Then** it reads false; `"no"` is a 400

#### Another person's message chimes once on web (rules 2, 3)
- **Given** a signed-in web user with the switch on who has interacted with the page
- **When** `message_created` from another sender arrives, twice within 2 seconds
- **Then** one chime plays
- **And** their own message's echo, a status event, the switch off, or the same conversation open
  in the focused tab plays none

#### iOS plays the foreground sound only with the switch on (rule 4)
- **Given** the signed-in user's switch is on **Then** the handler answers `shouldPlaySound: true`;
  off → false

#### Every iOS push carries the sound while the switch is on (rule 5)
- **Given** a recipient with the switch on and an iOS token, registered with or without
  `notification-sound` (1.3.1), or with no recorded platform **Then** the Expo message has
  `sound: "default"`
- **Given** the switch off, or the capability switched off **Then** an iOS token's message has no
  `sound` key
- **Given** the switch on and an Android token **Then** the message has `sound: "default"` only if
  that token was registered declaring `notification-sound`
- **Given** a registration with the header **Then** the token is sound-capable; re-registering the
  same token from a declaring build turns it on
