---
id: B-706
title: "iOS build 34 registered the raw APNs device token as a push token: daily DeviceNotRegistered churn, and a logout that left the account's Expo token on the phone"
type: wrong-rule
severity: high
status: open
affects:
  - messaging.push-notifications
  - auth.logout
  - frontend/apps/mobile/src/lib/push/expoPushRegistrar.ts
  - backend/padel_app/modules/notifications_api.py
  - backend/padel_app/modules/api_auth.py
proposed_fix: "The registrar treats a push-token event only as a signal and fetches its Expo token again; the server stores only Expo-shaped tokens (one shape check), and a logout or unregister that names a non-Expo token removes every Expo row the caller holds."
opened: 2026-10-29T19:20:00Z
---

# B-706: iOS registered the raw device token

**Source:** PAD-741 (students with notifications on not receiving the push), third prod read on
2026-10-29 by SessionH, read-only, counts and ids only.

**What happens:** PAD-744 (commit `4e2a2180b`, iOS build 34) added `watchTokenRotation()` to the
registrar. It subscribes with `Notifications.addPushTokenListener`, whose event carries a
`DevicePushToken`: the raw native token (64 hex characters on iOS), not an Expo push token. The
listener posted `event.data` to `POST /api/notifications/device` because it differed from the
cached Expo token, and cached it. So every launch registered the Expo token and then the raw one.
Expo answers `DeviceNotRegistered` for the raw token, the sender deletes the row and records a
`push_failed` incident, and the next launch inserts it again.

**Evidence (prod, 29/10):**
- 33 rows with a 64-hex token, the first created 25/10 20:17Z, all held by users who also hold an
  Expo token, none ever with a receipt.
- All 269 `push_failed` apns incidents from 24/10 to 29/10 are `DeviceNotRegistered`. In 266 of
  the 270 incident-user-days the same user had an `ok` receipt, so delivery itself was unharmed.
- 50–70 `device_tokens` rows inserted and deleted per day (ids 401–474 allocated on 28/10, 22
  kept).

**Second effect (from the code):** the cached token became the raw one, so the logout's
`DELETE /device` and `/auth/logout {pushToken}` removed only the raw row. The account's Expo token
stayed, and the signed-out phone kept receiving the account's pushes until another account signed
in on it: the B-167 shape.

**Why it was the wrong rule:** rule 15 said "a new token becomes the cached token and is posted".
It assumed the listener reports an Expo token. It reports the native one.

**Fix (PAD-741):**
- **Mobile:** a push-token event makes the registrar fetch its Expo token again
  (`getExpoPushTokenAsync`) and post it only when it changed. The event's token is never posted or
  cached, so logout always sends the Expo token. This ships in iOS build 36.
- **Backend:** one shape check (`utils/push_token_shape.py`). `POST /device` answers 200 and
  stores nothing for a non-Expo token, and also drops a row the caller already held for it. It
  logs an INFO line with the user id and the shape, never the token.
- **Logout and unregister with a non-Expo token** (builds 34 and 35) remove every Expo row the
  caller holds, plus the exact-token row.

**How the logout is matched:** by account, not by device. The server keeps nothing that ties a
raw token to its Expo token, and a build-34 phone cannot name its Expo token at logout. Removing
all of the caller's Expo rows is the superset that guarantees the signed-out phone stops
receiving the account's pushes. The cost: the same account's other phone receives no pushes until
it registers again at its next cold start or login. From build 36 the logout names the Expo token,
and only that row goes. Rule 9b records this.

**Done when:**
- 0 rows with a 64-hex token in `device_tokens`;
- `push_failed / DeviceNotRegistered` under 5 a day (it was 47–85);
- token ids allocated per day close to the rows kept.
