---
id: B-236
title: "iOS: a warm push tap opened a fresh cached thread without the pushed message, and marked it read unseen"
type: incomplete-rule
severity: high
status: triaged
affects:
  - messaging.push-notifications
  - frontend/apps/mobile/src/features/messages/open-sequence.ts
  - frontend/apps/mobile/app/conversation/[id].tsx
proposed_fix: "A push-target open makes its own GET when the cached thread lacks the target and the target is newer than the newest cached message; mark-read then waits for that GET."
opened: 2026-10-01T18:48:32Z
---

# B-236: a warm push tap opened a fresh cached thread without the pushed message (PAD-475)

**Source:** owner report on build 27 (1.2.0), 2026-10-01; reproduced on the simulator at staging 439ae2088.

**What happens:** the app is in the background, a message arrives, the coach taps its push. The thread opens without the new message, and the message is no longer unread anywhere.
**What should happen:** the thread opens with the pushed message on screen, under the "Unread messages" divider, as it does from a cold start.

**Root cause (observed):** `threadQueryOverrides` returns no override for an explicit `?message=` target (B-190 kept the cache for flow 103), so the only fetch is react-query's default refetch on mount, which runs only when the entry is older than the 30 s `staleTime`. Nothing writes the entry while the app is away unless a thread screen is mounted: the tabs layout's SSE handler only invalidates lists. A thread visited under 30 s before the tap is therefore served from cache with no GET; the open's phase is "none", so `shouldMarkRead` fires at once and the unseen message is marked read.

**Evidence (2026-10-01, own Flask log, own Metro; the thread is closed before backgrounding):**

| cell | result | requests after the student's post |
|---|---|---|
| warm, entry under 28 s, deep link (18:37:45Z) | red: `message-item-5` never visible in 20 s | no GET of conversation 1; one `POST conversation/1/read` 1 s after the post |
| warm, entry under 28 s, real `simctl push` + banner tap (18:45:42Z) | red: `message-item-54` absent | no first-page GET; read POST; one `before=24` page (B-237) |
| warm, 40 s in background (entry 44 s old) | green, message under the divider | `GET ?limit=30`, then the read POST |
| cold start | green | `GET ?limit=30`, then the read POST |
| warm, thread 1 still mounted under thread 2 | green | no GET: the mounted screen's SSE handler wrote the message (the simulator does not suspend JS in 8 s) |

The absence of a GET in the two red cells is the observation that selects the cause. The real tap and the deep link agree.

**Limit:** the red needs a visit to the thread under 30 s before the tap. Whether that was the owner's sequence is not established; a real device may also fail in ways the simulator cannot show (JS suspension, a first request failing on resume).

**Affected specs:**
- Dev: `.specflow/specs/messaging/push-notifications.spec.md` (rule 12 says nothing about a target newer than the cached thread)
- Business: `.specflow/specs-business/messaging/user-manages-unread-and-notifications.business.md` (still correct; no drift)

### Change plan
- Spec: add rule 12a and a criterion to `messaging.push-notifications` (a warm tap shows the message it announces, unread).
- Tests: Maestro flow 122 (red on today's code); query-core unit tests of the override and of mark-read's ordering.
- Code: `threadQueryOverrides(explicitTarget, cachedMessageIds)` forces the GET only when the target is absent from, and newer than, the cached thread. Flow 103's shape keeps the cache.
- Regression: flows 103 and 114 on the simulator, 2×2.

**Limit of the id-order premise:** a message whose id was allocated before, but committed after, a higher id (two interleaved inserts in one thread) can be absent from a cache that holds the higher id. Rule 12a then keeps the cache for it. The window is one transaction's length; not handled.

### Follow-up (not in this change)
- A deep link or universal link onto the thread that is ALREADY focused is a NAVIGATE, not a PUSH: expo-router reuses the focused route with new params, the screen does not mount, and rule 12a's GET does not run. A push tap is not affected (`PushTapRouter` uses `router.push`, pinned in `open-sequence.warm-target.test.ts`). Condition to reproduce: thread 1 focused, fresh cache, `levelup://conversation/1?message=<newer id>`.
