---
id: messaging.update-nudge
status: implementing
depends_on: [messaging.messages, messaging.push-notifications, messaging.sse-realtime]
serves: [P-MESSAGING-3]
governed_by: []
---

# messaging.update-nudge

> Stream perf, 2026-11-20/22. iOS builds up to 1.3.4 (37) are very slow for some users (the push-token
> loop fixed in 1.3.5 (38)) and the app has no force-update mechanism. Owner decision: tell those users,
> once, inside the app and by push. Temporary: retire it, with `UPDATE_NUDGE_MAX_BUILD`, once nobody is
> on build 37 or older.

### Intent
A signed-in user on an old iOS build gets one message from the LevelUp Assistant, and one push with the
same text, telling them to update to 1.3.5. Nothing else changes for anyone, and the request that
revealed the old build is never slowed or failed by it.

### Entities
- **READS / WRITES:** Conversation (the user's Assistant conversation), Message (`msg_metadata`)
- **READS:** User (`language`), AppSetting (`update_nudge_enabled`)

### Rules
1. **Who: the build, read from the User-Agent.** An authenticated request that succeeded whose
   `User-Agent` starts `LevApp/<n>` (the iOS app, `CFNetwork` default) with `n <= UPDATE_NUDGE_MAX_BUILD`
   (37) is from an old build. The header is parsed first and the database is not touched for any
   other request: web, build 38 or newer, no `User-Agent`, an unauthenticated or failed request, a
   view-as request, and the sign-out calls do nothing.
2. **Once per user, ever, across workers.** The first old-build request of a user that finds no nudge
   in their Assistant conversation posts one; every later request, from any worker, finds it and does
   nothing. A user's startup sends several requests in the same second, so the check and the post
   happen under a lock on the user's Assistant conversation row (the conversation is created first if
   missing, through its own race-safe `get_or_insert`): of two requests at once exactly one posts and
   pushes, and the other waits for the lock and then finds the first's message. No new table or
   column: the marker is the message's `msg_metadata` (`{"kind": "update-nudge", "maxBuild": 37}`).
3. **What: a plain message from the Assistant.** The message is from the LevelUp Assistant user, in
   that user's Assistant conversation, of the default type `text` (never `engine_alert`, which the
   build-37 app draws specially; old builds draw `text` as text), published as `message_created` to
   the conversation's recipients, then one push with the same text: the web push and the Expo push
   (title "LevApp 1.3.5", opening the conversation).
4. **Language: the user's.** The text follows `users.language` (`pt` when it is anything else):
   - pt: "A LevApp 1.3.5 já está na App Store. A versão que tens tem um erro que a torna muito lenta. Para atualizar: abre a App Store, toca na tua foto (canto superior direito) e toca em Atualizar ao lado da LevApp."
   - en: "LevApp 1.3.5 is now on the App Store. The version you have has a bug that makes it very slow. To update: open the App Store, tap your photo (top right) and tap Update next to LevApp."
   - fr: "LevApp 1.3.5 est disponible sur l'App Store. Ta version a un bug qui la rend très lente. Pour mettre à jour : ouvre l'App Store, touche ta photo (en haut à droite) puis touche « Mettre à jour » à côté de LevApp."

   The text carries the steps, not a link: builds 33-37 draw message text as plain text with no link
   detection, and a push tap only opens the app. The push body is the whole text (nothing shortens it).
5. **Never a failure mode.** The nudge runs after the response is built, in its own database
   session. Any exception is logged and swallowed; the response, its status and its headers are
   unchanged, and the request's own work is neither committed nor rolled back by it.
6. **A switch.** `app_settings` key `update_nudge_enabled` (boolean) wins; with no row the env
   `UPDATE_NUDGE_ENABLED` decides; with neither it is on. Off: nothing is posted or pushed (a
   user nudged before it was switched off keeps the message). Read through a per-worker cache of at
   most 30 seconds.

### Acceptance Criteria

#### MESSAGING-UPDATE-NUDGE-1: An old iOS build is told once, in a plain Assistant message and a push (rules 1, 3)
- **Given** a signed-in user and a request with `User-Agent: LevApp/37 CFNetwork/1494 Darwin/23`
- **When** it succeeds
- **Then** the user's Assistant conversation holds one message from the Assistant, type `text`,
  `msg_metadata` `{"kind": "update-nudge", "maxBuild": 37}`, published as `message_created`
- **And** one web push and one Expo push carry the same text, with the conversation's link

#### MESSAGING-UPDATE-NUDGE-2: Other requests do nothing (rule 1)
- **Given** a signed-in user
- **When** the request has `LevApp/38`, a browser `User-Agent`, no `User-Agent`, is unauthenticated,
  fails (4xx), uses a view-as token, or is a sign-out call
- **Then** nothing is posted or pushed, and no conversation is created

#### MESSAGING-UPDATE-NUDGE-3: Once per user, also when two requests arrive together (rule 2)
- **Given** a user on build 37
- **When** a second request follows the first, and when two requests run at the same moment on two connections
- **Then** the conversation holds exactly one nudge and exactly one push was sent for it

#### MESSAGING-UPDATE-NUDGE-4: The text follows the user's language (rule 4)
- **Given** users whose `language` is `pt`, `en`, `fr` and something else
- **When** each makes an old-build request
- **Then** the message text is the pt, en, fr and pt text of rule 4

#### MESSAGING-UPDATE-NUDGE-5: A failing nudge never fails the request (rule 5)
- **Given** a nudge that raises (posting, publishing or pushing)
- **When** an old-build request is made
- **Then** the response is the route's own (status and body) and the error is logged

#### MESSAGING-UPDATE-NUDGE-6: The switch turns it off (rule 6)
- **Given** `update_nudge_enabled` false in `app_settings` (or the env off with no row)
- **When** an old-build request is made
- **Then** nothing is posted or pushed; with the row true it is, whatever the env says
