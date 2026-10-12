---
id: B-525
title: "Web chat showed a sent message twice when the live message_created echo arrived before the send POST answered"
type: incomplete-rule
severity: medium
status: resolved
affects:
  - messaging.sse-realtime
  - frontend/apps/web/src/pages/MessagesPage.tsx
  - frontend/packages/hooks/src/conversationPaging.ts
proposed_fix: "Settle the send through one shared helper, reconcileSentMessage: when the saved id is already in the thread, drop the optimistic row instead of replacing it. Web and iOS both call it."
opened: 2026-10-12T18:59:00Z
resolved: 2026-10-12T18:59:00Z
---

# B-525 — a sent message showed twice on web

**Source:** PAD-647 (a duplicate bubble in the web chat). Session C first reported it; Session B
found the root cause.

**What happens:** the coach sends a message on web. The optimistic row `temp-<ms>` is shown. The
sender's own `message_created` echo arrives over SSE before the POST answers. `applyIncomingMessage`
does not find the saved id, so it appends the message. Then the POST answers, and
`handleSendMessage` replaces the temp row with the saved message, so the same id is in the thread
twice and two bubbles show.

**What should happen:** one bubble, whichever answer lands first.

**Root cause:** `messaging.sse-realtime` had no rule for an echo that arrives before the POST answers
(incomplete rule). iOS already checked for the saved id before replacing the temp row
(`conversation/[id].tsx`). Web did not, and the two copies of the logic had drifted.

**Evidence:**
- `e2e/messaging/send-one-bubble.spec.ts` holds the POST through `route.fetch()` until the echo has
  rendered, then releases it.
- On staging 9d0680c5e it failed with `toHaveCount(1)`: Received 2.
- With the fix it passed 3/3.
- Unit tests in `conversationPaging.test.ts` cover the POST-first and echo-first orders.
- US-58 passed on staging 6/6 before the fix. It used `getByText(...).last()`, which cannot see a
  duplicate, so it now asserts exactly one bubble inside `message-scroller`.

### Change Plan

- Spec: `messaging.sse-realtime` rule 19 and the criterion "The echo that beats the POST leaves one
  bubble".
- Code: `reconcileSentMessage` in `@levelup/hooks`, used by web `MessagesPage` and iOS
  `conversation/[id].tsx` (which replaces its inline copy).
- Tests: the new E2E spec, the unit cells, and the tightened US-58.

### Resolution

- Spec changes: `.specflow/specs/messaging/sse-realtime.spec.md` (rule 19 and the criterion).
- Tests added/modified: `send-one-bubble.spec.ts` (new), `conversationPaging.test.ts`, and US-58 in
  `direct-messages.spec.ts`.
- Code changes: the shared helper; web and iOS call sites.
- Resolved: 2026-10-12 (PAD-647).
