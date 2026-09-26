---
id: B-190
title: "iOS thread: opening a thread an SSE write had just made fresh skipped the GET, so no first unread was frozen"
type: incomplete-rule
severity: medium
status: resolved
affects:
  - messaging.conversation-detail
  - frontend/apps/mobile/app/conversation/[id].tsx
  - frontend/apps/mobile/src/features/messages/open-sequence.ts
proposed_fix: "A plain open always refetches on mount (threadQueryOverrides); a push-tap open keeps the cache, as flow 103 needs."
opened: 2026-09-26T09:27:01Z
resolved: 2026-09-26T09:34:03Z
---

# B-190: a fresh cached thread opened without its first unread (PAD-415, #447)

**Source:** Session-C's re-review of #447 at 50cf970d6; reproduced by Session-B on query-core.

**What happens:** a coach who had the thread cached opens it soon after new messages arrived: no divider, no landing on the first unread.

**Root cause (reproduced):** the thread's cache entry is the one the SSE handlers write into (`setQueryData`), and each write makes it fresh again for the app's 30 s `staleTime`. A fresh entry is served without a GET, so `isFetchedAfterMount` stays false and `shouldFreezeFirstUnread` never fires. `open-sequence.fresh-cache.test.ts` drives exactly that on query-core: 0 fetches with no override (red), 1 with the fix. Flow 114 cannot reach it (its first open follows `stopApp`, with no cached entry).

### Change plan
- `threadQueryOverrides(explicitTarget)`: a plain open gets `refetchOnMount: "always"`; a push-tap open (`?message=`) keeps the cache (forcing it there broke flow 103).
- Proof: the query-core test above; flow 103 still lands on its target.

### Resolution
- Spec: `messaging.conversation-detail` rule 10 note and a criterion.
- Tests: `open-sequence.fresh-cache.test.ts` (query-core: 0 fetches with no override, red; 1 with the fix), plus a push-target open that keeps the cache.
- Code: `threadQueryOverrides` in `open-sequence.ts`, passed to `useConversationThread`.
- Flow 103 (push target, cache kept) green; flow 114 4 of 4.
- Resolved: 2026-09-26T09:34:03Z
