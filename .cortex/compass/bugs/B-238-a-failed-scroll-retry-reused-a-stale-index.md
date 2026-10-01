---
id: B-238
title: "iOS thread: the failed-scroll retry reused a stale index and threw once a refetch had shrunk the list"
type: missing-criterion
severity: medium
status: resolved
affects:
  - messaging.push-notifications
  - frontend/apps/mobile/app/conversation/[id].tsx
proposed_fix: "The retry re-resolves the row by message id and is dropped when the row is gone."
opened: 2026-10-01T18:48:32Z
resolved: 2026-10-01T19:51:03Z
---

# B-238: the failed-scroll retry reused a stale index (PAD-475)

**Source:** found while reproducing B-236, 2026-10-01 (40 s cell with 45 filler messages, 18:41:27Z to 18:43:22Z).

**What happens:** uncaught "scrollToIndex out of range: requested index 50 is out of 0 to 29" at `app/conversation/[id].tsx` (`onScrollToIndexFailed`'s retry).
**What should happen:** rule 12: a landing never errors; a row that is gone is simply not scrolled to.

**Root cause (from the screenshot and the Flask log):** the cached thread held two pages (50 rows). A late SSE arrival appended the pushed message (index 50) and the landing scrolled to it; the row was unmeasured, so `onScrollToIndexFailed` scheduled a retry of the same INDEX 50 ms later. In between, the open's GET replaced the entry with the 30-row first page. The retry passed an index the list no longer has.

**Inference, not shown:** this is probably the mechanism behind PAD-415's "a forced refetch broke flow 103's landing" (a target above index 29 in a multi-page cache, then a refetch that shrinks the list).

**Affected specs:** `.specflow/specs/messaging/push-notifications.spec.md` rule 12 ("with no error") has no criterion for a list that changes under a pending scroll.

### Change plan
- Spec: one sentence in rule 12a and a criterion.
- Tests: unit test of a pure `retryScrollIndex(messages, messageId)`, red against a stub.
- Code: `onScrollToIndexFailed` remembers the message id being landed on and re-resolves it at retry time.

### Follow-up (not in this change)
- Whether retry-by-id makes a forced refetch safe for flow 103's shape (PAD-415's history) is untested and is not relied on: rule 12a still keeps the cache for a target older than the newest cached message.

### Resolution
- Proof is at unit level: `target-landing.test.ts` (`retryScrollIndex`), watched red against a stub. The same 45-filler cell on the new code (978bf5c79) showed no error and landed on the message under the divider, but the trigger depends on a late SSE arrival and was not shown to have occurred in that run, so that cell is not a 2×2 cell.
- Spec: `messaging.conversation-detail` rule 9b and a criterion.
- Code: `onScrollToIndexFailed` re-resolves `scrollTargetIdRef` in `messagesRef` at retry time and drops the retry when the row is gone.
- Resolved: 2026-10-01T19:51:03Z
