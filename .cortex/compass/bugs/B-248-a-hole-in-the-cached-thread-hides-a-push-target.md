---
id: B-248
title: "iOS thread: a push target missing from the middle of the cached thread is never fetched, and is marked read unseen"
type: incomplete-rule
severity: low
status: triaged
affects:
  - messaging.push-notifications
  - frontend/apps/mobile/src/features/messages/open-sequence.ts
  - frontend/apps/mobile/src/features/messages/use-thread-open.ts
  - frontend/apps/mobile/app/conversation/[id].tsx
proposed_fix: "When the walk exhausts without finding the target, fall back once to the open's GET, and hold the read mark while a target is pending."
opened: 2026-10-01T20:06:18Z
---

# B-248: a hole in the cached thread hides a push target (PAD-475 follow-up)

**Source:** the independent review of #488 at 56d6f4295, 2026-10-01. Read from the code; not reproduced on a simulator.

**What happens:** rule 12a keeps the cached thread when the target is older than the newest cached message. That does not show the target is in an older page: the cached thread can have a hole. The walk only loads pages before the oldest loaded message, never finds the target, and gives up; the open's phase is "none", so the thread was marked read at mount. The message is never shown and is no longer unread.

**Reproduction (by construction):** thread mounted, app in the background, message 100 is missed (stream suspended). The app is resumed from its icon and message 101 arrives by SSE, so the cached thread is `[..., 99, 101]` and fresh. The coach then taps message 100's push. `cacheCoversTarget("100", [99, 101])` is true, so no GET runs.

**What should happen:** the message is shown, still unread.

**Affected specs:** `.specflow/specs/messaging/push-notifications.spec.md` rule 12a (states the limit since #488).

### Change plan
- Spec: extend rule 12a: a walk that exhausts without finding the target falls back once to the open's GET; the thread is not marked read while a target is pending.
- Tests, red first: query-core, cache `[99, 101]`, target 100, fresh entry: one GET after the walk gives up, read mark only after it settles; a second exhaustion does not fetch again.
- Code: `useThreadOpen.targetStep` returns a "refetch" step once per open on "give-up" when the open made no GET; the open re-enters "in-flight"; `shouldMarkRead` takes a "target pending" input.
- Risk to check: this changes WHEN flow 103's shape marks the thread read (after the target is found, not at mount). Flows 103, 114 and 122 on the simulator, 2×2.
