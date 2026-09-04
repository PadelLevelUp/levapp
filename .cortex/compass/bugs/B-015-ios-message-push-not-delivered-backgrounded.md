---
id: B-015
title: "iOS message pushes are not delivered while the app is backgrounded, and the backend cannot tell"
type: incomplete-rule
severity: high
status: triaged
affects:
  - messaging.push-notifications
  - backend/padel_app/utils/expo_push.py
  - frontend/apps/mobile/src/lib/push/expoPushRegistrar.ts
  - frontend/apps/mobile/src/auth/AuthContext.tsx
proposed_fix: "Add two rules to messaging.push-notifications: (a) the client re-registers its Expo token whenever iOS reissues one (Notifications.addPushTokenListener), not only at login/cold start; (b) the server redeems Expo ticket ids via /push/getReceipts so an APNs-level delivery failure is observable instead of silent."
opened: 2026-09-04T00:00:00Z
---

# B-015 — iOS message pushes are not delivered while the app is backgrounded, and the backend cannot tell

**Source:** human report — Linear PAD-118 (reporter `pedrompacheco95`, via Discord).

**What happens:** A DM sent to a user whose iOS app is backgrounded or closed produces no
push banner. The message is present when the app is next opened. In-app (SSE) delivery
works normally while the app is in the foreground.

**What should happen:** APNs delivers the alert while the app is backgrounded or closed
(`messaging.push-notifications` rule 1 + `_overview.md` for the messaging domain).

**Reproduced:** NO — not reproducible without a physical device on a Release/TestFlight
build. The iOS Simulator cannot receive APNs, and this wave's simulator budget belongs to
another ticket. What *was* reproduced is the backend half (see below), which excludes the
server from the fault set.

## Root cause

Not a single defect. The investigation excluded the reported hypothesis and isolated two
real gaps, one of which is almost certainly the mechanism and the other of which is why
nobody can prove it.

### Excluded: "the backend skips the push when the recipient is on SSE"

There is no such gate, and there could not be one.
`backend/padel_app/services/messaging_service.py:188-208` calls `send_push_notification`
and `send_expo_push_to_user` unconditionally for every recipient participant. The only
guard in `create_message_service` is `_is_blocked_either_way`
(`messaging_service.py:159-161`), which `abort(403)`s the *entire send* — it cannot
produce "the message arrives but the push doesn't". `backend/padel_app/realtime.py:3-22`
holds an anonymous `list[queue.Queue]` with no user identity at all, so per-user presence
is not merely unused here, it is not expressible (this is also B-004). No mute flag, no
`notificationsBlocked`, and no student notification preference is consulted on this path.
Pinned by `test_direct_message_push_fires_while_recipient_is_connected_over_sse`.

### Gap 1 (probable mechanism) — a reissued APNs token is picked up only on the next cold start

`ExpoPushRegistrar.register()` has exactly two call sites, both in
`frontend/apps/mobile/src/auth/AuthContext.tsx` — line 61 (silent restore on app start)
and line 101 (after login). There is no `Notifications.addPushTokenListener` anywhere in
`apps/mobile`. That listener exists precisely for the case where iOS issues the app a new
device token (OS update, app update, device restore, prolonged uninstall/reinstall). Until
it fires, `device_tokens` holds a token that no longer addresses the device, every push to
it fails at APNs, and the app has no idea. The next cold start runs silent restore, which
re-registers and repairs the row.

That chain reproduces the reported symptom exactly, including the odd detail that
force-closing and reopening the app is what makes things work again.

### Gap 2 (why it is undiagnosable) — the sender reads tickets and calls them receipts

`backend/padel_app/utils/expo_push.py:85` treats `response.json()["data"]` from
`https://exp.host/--/api/v2/push/send` as delivery receipts. It is the *ticket* array:
it says only that Expo accepted the message for delivery. APNs-level verdicts —
`BadDeviceToken` (stale token, or an `aps-environment` mismatch), `InvalidCredentials`
(missing/expired APNs key on the EAS project) — appear only in a *second* call to
`https://exp.host/--/api/v2/push/getReceipts`, keyed by the ticket id. That call does not
exist anywhere in the repo, and the ticket id is discarded at `expo_push.py:86`.

So `send_expo_push` returns `True` for a push that was never delivered, and the server
logs say nothing. PAD-153's log-level fix (`expo_push.py:94-100`, `logger.info` →
`logger.warning`) raised the volume of the one branch that *is* observed; it did not add
the observation that is missing.

### Not the cause: PAD-153 (badge sync)

`ee80479` is purely additive on the send path: an optional `badge` kwarg forwarded to the
Expo payload only when not `None`, plus the log-level change. The one way it could have
regressed delivery is `badge=get_unread_count(participant.user_id)` being evaluated at the
call site (`messaging_service.py:207`) — if it raised, `send_expo_push_to_user` would never
run. It cannot be raising in production: the same exception would abort
`create_message_service` before `publish()` at `messaging_service.py:210`, and the reporter
confirms in-app SSE delivery is working. Pinned by
`test_direct_message_posts_expo_push_body_to_exp_host`, which asserts the full wire body
including `badge: 1`.

### Not pursued: the `aps-environment` entitlement

`docs/INFRA_HANDOFF.md:96` already records that the checked-in entitlement says
`development` and that Xcode reconciles it to `production` at archive time — and calls it
"a recurring source of false alarm". Left alone; a `getReceipts` verdict of
`BadDeviceToken` would be the evidence that reopens it.

## Affected specs

- Dev: `.specflow/specs/messaging/push-notifications.spec.md`
- Business: `.specflow/specs-business/messaging/user-manages-unread-and-notifications.business.md`

Note a secondary drift: the dev spec's Intent says pushes are sent "when the recipient
isn't actively viewing the conversation", which the implementation has never done — it
sends to every recipient unconditionally. Harmless today, but it is the sentence that
seeded PAD-118's wrong hypothesis, so it should be corrected to match reality.

### Change Plan

**Spec to modify:** `.specflow/specs/messaging/push-notifications.spec.md`
**Change type:** Add rules + acceptance criteria (Type 2), plus one Intent correction.

**Correct the Intent** from "when the recipient isn't actively viewing the conversation"
to "for every recipient of the message, independent of their app state or SSE connection".

**Add these rules:**

7. The native client re-registers its Expo push token whenever the OS reissues one, not
   only at login and cold start. A device token that iOS has rotated must not be allowed
   to sit stale in `device_tokens` until the app is next relaunched.
8. A native push whose Expo ticket is accepted is not yet delivered. Ticket ids are
   retained and redeemed against Expo's receipts endpoint, and a receipt reporting
   `DeviceNotRegistered` or `BadDeviceToken` removes the token; any other error is logged
   at warning with the token and the receipt.

**Add these criteria:**

*Rule 7 — rotated token is re-registered without a relaunch*
- **Given** a signed-in iOS client with a registered Expo push token
- **When** the OS issues the app a new push token while the app is running
- **Then** the client POSTs the new token to `/api/notifications/device` immediately.

*Rule 8 — an undelivered push is observable*
- **Given** a message push whose Expo ticket came back `ok`
- **When** the receipt for that ticket reports `DeviceNotRegistered`
- **Then** the `DeviceToken` row is deleted and the failure is logged at warning.

**Then:**
1. Coherence check (rule 8 interacts with the existing `DeviceNotRegistered` handling at
   `expo_push.py:92-104`, which currently acts on a *ticket*; it should move to the
   receipt path).
2. Generate atomic tests for both criteria.
3. Fix the client (`addPushTokenListener` wired alongside the existing registrar) and the
   server (receipt redemption — needs a scheduler hook and somewhere to park ticket ids;
   Expo recommends waiting ~15 minutes, so this is a scheduled job, not an inline call).
4. Run regression for the messaging domain.

**Design question the plan does not settle:** where receipt polling lives. The obvious
home is `padel_app/scheduler.py` alongside the other periodic jobs, with ticket ids stored
on a new table (or on `NotificationEvent`). That is real design work — this bug does not
prescribe it.

### Verification that cannot be done without hardware

The ticket cannot be closed from a repo. On a physical device, on a Release/TestFlight
build:

1. Install, sign in, grant notification permission.
2. Confirm a `device_tokens` row exists for that user and that its token matches what the
   device reports.
3. From a second account, send a DM with the app backgrounded.
4. Capture the ticket id from the `/push/send` response (needs a temporary log line — the
   id is currently discarded).
5. `curl` `https://exp.host/--/api/v2/push/getReceipts` with that ticket id.

Step 5's answer picks the branch: `DeviceNotRegistered`/`BadDeviceToken` → Gap 1 (stale
token); an `InvalidCredentials`-class error → the Expo project's APNs key; `ok` → the
backend delivered and the fault is client-side presentation.

### Resolution

Not yet resolved. This entry records the diagnosis only; no delivery fix was written.
Characterisation tests added in `backend/padel_app/tests/test_native_push.py`
(`test_direct_message_posts_expo_push_body_to_exp_host`,
`test_direct_message_push_fires_while_recipient_is_connected_over_sse`,
`test_expo_ticket_response_is_not_a_delivery_receipt`).
