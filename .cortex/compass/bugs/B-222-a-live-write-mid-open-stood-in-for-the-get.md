---
id: B-222
title: "iOS thread: a live write during the open's GET froze the previous visit's first unread and marked read early"
type: incomplete-rule
severity: medium
status: triaged
affects:
  - messaging.conversation-detail
  - frontend/apps/mobile/app/conversation/[id].tsx
  - frontend/apps/mobile/src/features/messages/open-sequence.ts
proposed_fix: "Freeze the first unread and mark read on the settle edge of the fetch this open saw start (advanceOpenFetch), never on isFetchedAfterMount."
opened: 2026-09-29T11:31:24Z
---

# B-222: a live write mid-open stood in for the open's GET (PAD-415, #447)

**Source:** Session-C's review of #447 at e590afa8e (issuecomment-5889315184); reproduced by Session-B on query-core 5.102.8.

**What happens:** a coach opens a cached thread. A message arrives through SSE while the open's forced GET (B-190) is still in flight. The thread freezes the PREVIOUS visit's first unread (a stale divider and landing) and marks the thread read before the GET answers, so the GET can come back with nothing unread. On a push-target open, `loadOlder`'s page merge froze a stale divider the same way.

**Root cause (reproduced):** `isFetchedAfterMount` is `dataUpdateCount > initial` (query-core queryObserver.ts:604-606). A manual `setQueryData` dispatches `success` with `manual: true` (query.ts:656-665), which bumps `dataUpdateCount` without ending the fetch. The screen's own SSE handler (`updateConversationCache`) writes that entry. Rule 10's B-190 note said "this open's value", but not which event makes a value this open's. Type incomplete-rule.

**Evidence (2x2 on query-core, the screen's first render mirrored with `_optimisticResults: "optimistic"` as useBaseQuery passes):**
- Old code with a mid-flight write: red. isFetching true, freeze true, mark-read true.
- Old code with no write: green.
- New code, both cells: green (`open-sequence.mid-flight.test.ts`).
- Load-bearing precondition, read in `packages/hooks/src/useConversationThread.ts`: the thread is a plain `useQuery` with `enabled: !!conversationId` (always true: the screen passes `String(params.id)`), the raw `isFetching`, and the per-open overrides spread into it. So a plain open's first render reports its mount fetch (`in-flight`). A gate that made that first render idle would decide `none` and silently lose the first unread; flow 114 is the end-to-end check.

### Change plan
- `advanceOpenFetch`: the phase of this open's fetch is `in-flight`, `settled` or `none`. It is decided at the first render and settles only on the in-flight to idle edge of `isFetching`.
- `shouldFreezeFirstUnread` requires `settled`. `shouldMarkRead` waits while `in-flight`.
- Spec: rule 10's B-222 note and a criterion.

### Resolution
- Spec: `messaging.conversation-detail` rule 10 note (B-222) and the criterion "A live update during the open's GET does not stand in for its answer".
- Tests: `open-sequence.mid-flight.test.ts` covers the trigger and a control, a push-target open over a fresh cache (no GET, marks at once, a page merge never freezes), and one over a stale cache (freezes from its GET, like web). `open-sequence.test.ts` and `.fresh-cache.test.ts` move to the phase API.
- Code: `open-sequence.ts` `advanceOpenFetch`; `app/conversation/[id].tsx` advances the phase during render and gates both effects on it.
- Not run yet: Maestro flows 103 and 114 on the simulator.
- Resolves once flows 103 and 114 pass on the simulator.
