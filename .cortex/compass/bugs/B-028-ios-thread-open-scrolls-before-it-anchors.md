---
id: B-028
title: "Opening an iOS conversation still shows older messages flying past before it anchors"
type: incomplete-rule
severity: high
status: open
affects:
  - messaging.conversation-detail
  - frontend/apps/mobile/app/conversation/[id].tsx
proposed_fix: "Rule 9 states the outcome but not the mechanism: say the list is not shown until it is anchored, and add rule 12 for a persistent jump-to-bottom control. Then gate the FlatList behind an `anchored` state driven by a deterministic reveal machine, and drop the first page to 30."
opened: 2026-09-07T00:00:00Z
---

# B-028 — Opening an iOS conversation still shows older messages flying past before it anchors

**Source:** PAD-224 (human report, TestFlight 1.1.7 / build 11, staging, 2026-09-07), the
second report of the same complaint after B-027 / PAD-208 shipped. Child of PAD-208.

**What happens:** opening a conversation still shows a fast scroll — older messages visibly
flying past — before the thread settles at the newest message. Scrolling up now holds
position correctly (B-027's other half is fixed).

**What should happen:** the thread appears already showing the newest messages, with nothing
having moved on screen. Nothing partially laid out is ever visible.

**Root cause:** Type 2 — incomplete rule. `messaging.conversation-detail` rule 9 says the
thread "opens anchored at the newest message, with no visible scroll animation… positioned at
its bottom before the user sees it". It states the *outcome* and forbids one particular
mechanism ("a list that renders the history and then travels to the end"), but it never says
the list must not be **shown** until it is anchored. PAD-208 satisfied the letter — one
`scrollToEnd({animated: false})`, no animation, no per-batch travel — with the list visible
throughout, which on Fabric still means the user watches it happen.

**Evidence (Phase 1):**

1. *No reveal gate exists.* Grepping
   `frontend/apps/mobile/app/conversation/[id].tsx` for `opacity` / `pointerEvents` /
   `anchored` / `InteractionManager` / `requestAnimationFrame` finds only unrelated
   `active:opacity-*` pressable styles. The `FlatList` is mounted visible from its first
   commit and every intermediate layout is on screen.
2. *The positioning is one call on a list that is still growing.*
   `handleContentSizeChange` calls `scrollToEnd({animated: false})` on the first content-size
   change (`hasPositionedRef`) and thereafter only while `atBottomRef.current`. Both branches
   run *after* a commit the user can already see.
3. *`initialNumToRender` does not make it one commit.* The list sets
   `initialNumToRender={CONVERSATION_PAGE_SIZE}` (50) but leaves `maxToRenderPerBatch`
   (default 10) and `updateCellsBatchingPeriod` (default 50 ms) alone, so VirtualizedList
   commits the initial window and then continues in batches as cells measure. Each commit
   fires `onContentSizeChange` and changes the content height — which is exactly the growth
   and chase the reporter describes. PAD-208's own comment ("`initialNumToRender` covers a
   whole page so that settle happens in one step") is the assumption this bug falsifies.
4. *Web is not affected, which localises it.*
   `frontend/apps/web/src/components/messages/MessageList.tsx` sets
   `el.scrollTop = el.scrollHeight` inside a `useLayoutEffect`, i.e. between React writing the
   DOM and the browser painting, so there is no intermediate painted frame to see. The defect
   is specific to the native list's incremental commit model.

**Reproduction:** **not reproduced locally.** The iOS simulator boots
(`xcrun simctl boot` on iPhone 17 Pro, iOS 26.5, succeeded — no privacy hang this time), but
`com.padellevelup.app` is not installed in this worktree and there is no `ios/` directory
(gitignored), so a recording needs a full `expo run:ios` native build from scratch. One
bounded attempt was made; see the PR for whether it produced a recording. The diagnosis
therefore rests on the code reading in (1)–(3) plus two independent field reports on two
builds (1.1.4 build 8 → B-027, 1.1.7 build 11 → this).

**Second, separate gap in the same report:** the user also asked for "a button to jump straight
to the bottom when you have scrolled up a lot". Rule 10 gives an affordance only when *new
messages* arrive while away from the bottom; nothing covers a reader who has simply scrolled a
long way back and wants to return. Web's `showScrollDown` chevron happens to cover it (it
appears whenever more than `AT_BOTTOM_THRESHOLD_PX` from the bottom), iOS's chip does not —
it is bound to `hasNewBelow`. That is a missing rule rather than a defect, and it is folded
into this entry because it is one report and one change set.

**Affected specs:**
- Dev: `.specflow/specs/messaging/conversation-detail.spec.md`
- Business: `.specflow/specs-business/messaging/user-and-coach-message-in-real-time.business.md`
  — journey step 2 already promises "lands on the most recent messages", which is what the user
  expected and did not get. **No business change needed**; this is the dev layer failing to
  deliver a promise the business layer states correctly.

### Change Plan

**Spec to modify:** `.specflow/specs/messaging/conversation-detail.spec.md`
**Change type:** tighten rule 9 (mechanism, not just outcome) + add rule 12 + three criteria

**Tighten rule 9 to say:** the first page is laid out and anchored at the newest message
**before the list is shown**. Until it is anchored the thread area shows a neutral placeholder
— never partially laid-out messages, never a moving viewport. The reveal is driven by an
observed end-of-content state, not by a delay, and carries a bounded fallback so a stuck
measurement can never leave the thread blank. The first page is small (`limit` 30) so the
anchor is immediate; the rest arrives by rule 11.

**Add rule 12:** whenever the viewport is more than about one screen height above the bottom, a
persistent jump-to-bottom control is shown; tapping it goes to the newest message. When
messages have arrived unseen it is the same control, carrying rule 10's "New messages" label.
Both shells.

**Add criteria:** (a) opening a 200-message thread never paints an intermediate frame whose
scroll offset is below the maximum; (b) scrolled about three screens up → the control is
visible, and tapping it returns to the bottom; (c) at the bottom → no control.

**Then:**
1. Coherence check against rules 10 and 11 (the reveal gate must not defeat rule 11's
   `onStartReached`, and rule 12 must not contradict rule 10's affordance).
2. Playwright probe spec (rAF + MutationObserver) for criterion (a) — failing first.
3. Unit tests for the anchoring state machine, extracted as a pure module.
4. Implement the reveal gate and the jump button on both shells.
5. Regression: backend, unit, tsc, `e2e/messaging`, full Playwright suite.

### Resolution

Pending — filled in when the change plan above has been executed.
