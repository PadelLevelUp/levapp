---
id: notifications.notification-sound
status: implementing
depends_on: [messaging.sse-realtime, messaging.push-notifications, settings.profile]
implements: ../../specs-business/messaging/user-manages-unread-and-notifications.business.md
governed_by: []
---

# notifications.notification-sound

> Linear: PAD-680 (reported by a coach via Discord). Shape approved by the coordinator, 2026-10-21.

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
5. **iOS, background (the payload), gated by capability.** A build that has the switch declares
   `notification-sound` (`X-LevApp-Capabilities`, PAD-352) when it registers its push token
   (`POST /api/notifications/device`, on every app start), and the server keeps that on the token
   (`device_tokens.sound_capable`). An Expo push carries `sound: "default"` only to a token whose
   build declared it, while the recipient's switch is on and the capability is not switched off
   (PAD-533); every other token gets no `sound` and stays silent. So App Store 1.3.1 (33) and older
   keep the silent pushes they always had (they have no switch to turn sound off), and the sound
   arrives with the first iOS build that carries the switch. Web shows the switch from this release;
   it also governs the new build's sound. **Retire** the gate with the capability, once no App Store
   build older than the first declaring one is in use.

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

#### The Expo payload carries the sound only to a build that declared it (rule 5)
- **Given** a recipient with the switch on whose token was registered declaring `notification-sound`
  **Then** the Expo message has `sound: "default"`
- **Given** the switch off, or a token registered without the capability (1.3.1), or the capability
  switched off **Then** the message has no `sound` key
- **Given** a registration with the header **Then** the token is sound-capable; re-registering the
  same token from a declaring build turns it on
