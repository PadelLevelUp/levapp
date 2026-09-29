---
id: B-189
title: "iOS thread: the first-unread (or push-target) landing was cancelled by rule 10's re-pin to the newest"
type: incomplete-rule
severity: high
status: resolved
affects:
  - messaging.conversation-detail
  - frontend/apps/mobile/app/conversation/[id].tsx
  - frontend/apps/mobile/src/features/messages/follow-state.ts
proposed_fix: "A programmatic landing suspends rule 10's following (follow-state.ts) until the reader drags, sends or jumps to the latest; while suspended neither a scroll frame at the bottom nor content growth (a new message included) re-pins."
opened: 2026-09-26T09:27:01Z
resolved: 2026-09-26T09:34:03Z
---

# B-189: the iOS landing was cancelled by rule 10's re-pin (PAD-415, #447)

**Source:** #447's flow 114 on the iPhone 17 Pro simulator (Session-D, then Session-B): intermittent, 5 of 8 completed runs failed on the old code.

**What happens:** opening a thread whose first unread sits behind the first page, the walk freezes the id, loads the older page and issues the animated `scrollToIndex` — and the thread ends on the newest message instead.

**Root cause (observed, run 9, absolute timestamps):** FREEZE 285 from this open's own GET → REVEAL → WALK load-older (30 → 80) → WALK scroll index 40 → TARGET `scrollToIndex` (.735) → a scroll frame at the bottom (dist -2, .772: the offset adjustment right after the prepend, before the animation moved) set `atBottomRef` back to true, though the walk had set it false → the next content-size change (.791) took `handleContentSizeChange`'s rule-10 branch, `scrollToEnd`, cancelling the landing; again at .963. Passing runs showed the same sequence and won the timing. Type: rule 10 said nothing about a landing in progress (incomplete rule).

### Change plan
- `follow-state.ts`: a pure reducer — `landing` suspends following; `scroll` cannot set "at bottom" while suspended; `contentGrew` re-pins only when at bottom and not suspended; `drag` / `toLatest` end it. Unit tests red first (the run-9 sequence; a new message while suspended).
- The screen dispatches the events it already receives; `atBottomRef` mirrors the reducer.
- Proof: the 2×2 on the simulator (old/new code × a landing present/absent) and flow 114 ×2.

### Resolution
- Spec: `messaging.conversation-detail` rule 10 gains "a landing is never re-pinned", plus a criterion.
- Tests: `follow-state.test.ts` (6; the run-9 sequence and a new message while suspended were red against today's rule).
- Code: `follow-state.ts`; the thread screen dispatches landing / scroll / drag / toLatest / contentGrew.
- The 2×2 on the iPhone 17 Pro simulator (flow 114's first open is the trigger, its re-open with nothing unread is the no-trigger cell):
  - old code, trigger: 5 of 8 completed runs failed; the re-open passed whenever it was reached;
  - new code, trigger: flow 114 passed 4 of 4, re-open included;
  - flow 103 (push target) green.
- Resolved: 2026-09-26T09:34:03Z
