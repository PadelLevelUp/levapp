---
id: B-166
title: "iOS cold start: a message-push tap navigates before the Root Layout mounts, loops and is lost"
type: missing-criterion
severity: high
status: triaged
affects:
  - messaging.push-notifications
  - frontend/apps/mobile/src/hooks/usePushNotificationRouting.ts
  - frontend/apps/mobile/app/_layout.tsx
  - frontend/apps/mobile/scripts/push-payloads/message.apns
proposed_fix: "Add a cold-start criterion to rule 7; hold the tap's target until the root navigator is mounted and auth has settled, then navigate once; reshape the simulator probe so its data sits under `body` as Expo delivers it."
opened: 2026-09-22T23:55:49Z
---

# B-166: a cold-start push tap is lost

**Source:** the owner's report, relayed by the Coordinator on 2026-09-22: "tapping a push opens Messages but the message isn't visible". The ticket is PAD-409, the sibling of PAD-408. The id comes from Session-D's range B-166–170. Reproduced by Session-D on the pinned simulator (iPhone 17 Pro, iOS 26.5, dev build, Metro), with temporary `console.log` instrumentation that has since been reverted.

**What happens:** the app is killed and the coach is logged in. A message push arrives and is tapped. `RootLayout` mounts and `usePushNotificationRouting`'s effect runs. `getLastNotificationResponseAsync()` resolves about 10 ms later with the tap, and `routeForPushData` correctly yields `/conversation/1`. `router.push` then fires **before the root navigator exists**, because `RootLayout` is still in its fonts/launch phase. The effect then re-mounts every ~6 ms, dozens of times (26 in runs 4 and 5), and each mount pushes the same id again, because the `handledIds` ref is new each time. Then:
- `ERROR Maximum update depth exceeded` (from `SceneView`)
- `WARN [push] tap routing failed [Error: Attempted to navigate before mounting the Root Layout component…]`

The dev build ends on the red "Render Error" box. The thread never opens.

**What should happen:** the tap opens `/conversation/<conversationId>` on a cold start exactly as it does on a warm one. This is `business/messaging/user-manages-unread-and-notifications`: "tapping it opens straight to that conversation".

## Evidence (all 2026-09-22, `date -u`)

| Run | App state | Payload | Result |
|---|---|---|---|
| warm 3, cold 1, cold 2, warm 4 | killed/bg | repo probe `message.apns` (keys at top level) | `content.data = null`, so `routeForPushData` returns null and no navigation happens; the app lands on the Dashboard |
| warm 5 (23:34:07Z), warm 6 (23:55:11Z) | backgrounded | Expo-shaped (`body: {type, conversationId}`) | `/conversation/1`, `chat-header-role` visible: **pass** |
| cold 3 (23:46:51Z), cold 4 (23:49:53Z), cold 5 (23:53:39Z) | killed | Expo-shaped | a navigate-before-mount loop, then "Maximum update depth exceeded" and a lost tap: **fail 3/3** |

The observation that selects the type: the tap reaches the app (`lastResponse` carries the notification id) and maps to the right route. It is lost only because navigation runs before the navigator mounts. The mapping is right and the timing is wrong. What the owner's **release** build shows (no redbox) was not observed. By inference, the app stays on or falls back to its tab shell, which fits "opens Messages but the message isn't visible".

**Second defect, found on the way (a test defect):** the repo's simulator probe `scripts/push-payloads/message.apns`, used by flow 47, carries `type`/`conversationId` at the top level of the APNs payload. expo-notifications builds `content.data` from the payload's `body` key, which is where Expo's push service puts `data`. The probe therefore arrives with `data = null` and can never route. That is why flow 47 could not pass even on a warm tap (see memory `simulator-push-tap-cannot-be-asserted-by-maestro`).

## Diagnostic tree

1. Dev spec: `messaging.push-notifications`. Yes.
2. Rule: rule 7 (the tap-routing contract). Yes.
3. Is the rule correct? Yes.
4. Does a criterion cover it? *"Tapping a message notification opens the thread (PAD-240)"* says a tap opens `/conversation/<id>` but never names the app's state. Nothing pins a tap that **launches** the app. **Missing criterion.**
5. Tests: `push-routing.test.ts` pins only the pure mapping, and flow 47 is a warm tap with a mis-shaped probe.

Drift: none. The business spec is right; the code fails it on a cold start.

## Change plan (Type 1 plus the probe defect)

**Spec:** `.specflow/specs/messaging/push-notifications.spec.md`. Add a criterion:

#### A tap that launches the app still opens the thread (PAD-409)
- **Given** a signed-in user whose app is not running
- **When** they tap a message push `{type: "message", conversationId: N}`
- **Then** the app launches and shows `/conversation/N` once, with no navigation before the root navigator is mounted and no repeated navigation
- **And** if the user is signed out, the tap's target is dropped and the normal login flow runs (decision recorded in rule 7)

**Then:**
1. Unit test (red first): the pending-target logic in `usePushNotificationRouting` holds a target until "navigator ready ∧ auth settled" and releases it exactly once, even across re-mounts, so the dedup must outlive the component.
2. Fix: navigate only when `useRootNavigationState()?.key` exists (or `router` readiness) and auth is not loading. Keep the dedup in a module-level set, not a component ref.
3. Reshape `scripts/push-payloads/message.apns` to `body: {type, conversationId}` and note the reason in flow 47's header.
4. Verification on the simulator: rerun the table above. Cold 3/3 must pass and warm must keep passing. A release-build device tap goes on the TestFlight checklist.

### Resolution

(filled in when PAD-408/409 ships)
