---
id: B-462
title: "iOS thread: opening the keyboard shrank the list but nothing scrolled it, so the latest messages went under the keyboard"
type: test-defect
severity: high
status: triaged
affects:
  - .specflow/specs/messaging/conversation-detail.spec.md
  - frontend/apps/mobile/app/conversation/[id].tsx
  - frontend/apps/mobile/src/features/messages/follow-state.ts
proposed_fix: "The follow-state reducer gets a viewport-shrank event that, at the bottom and not during a landing, scrolls to the end; the screen dispatches it from the list's onLayout when the height drops (the keyboard). A Maestro flow with screenshots proves it on the simulator."
opened: 2026-10-09T20:40:00Z
---

# B-462: the latest messages hide under the keyboard

> Ledger id **unconfirmed** (wave-13 range B-461–480 assigned by the coordinator; B-461 is PAD-568
> on a sibling branch, so this index line sits after B-383 here).

**Source:** PAD-569 (owner, 2026-10-09, App Store and TestFlight builds): tapping the composer
opens the keyboard but the thread does not follow; the screen shows the middle of the conversation
and the newest messages are behind the keyboard.

**What happens:** `app/conversation/[id].tsx` wraps the thread in a `KeyboardAvoidingView`
(`behavior: "padding"`, offset 0, rule 7's docking is right). When the keyboard opens the view pads
its bottom by the keyboard height, so the `FlatList` viewport shrinks by that much. The list is NOT
inverted (Fabric hit-testing, see the comment block at ~L531), so its content offset counts from the
top: a shorter viewport with the same offset shows the same top edge and loses the bottom. Nothing
scrolls it: `follow-state.ts` reacts to `contentGrew` (rule 10, a new message while at the bottom)
and to the reader's own actions, but has no event for the viewport changing size, and the list's
`onLayout` only feeds the anchor reducer (rule 9).

**What should happen (rule 7, rule 10):** at the bottom, the list rises with the keyboard and the
newest message stays visible above the composer; away from the bottom the keyboard opening moves
nothing (rule 10 already says so); sending scrolls to the new message (already `scrollToBottom`
in `handleSend`); closing the keyboard restores the layout without a jump; an incoming message
auto-scrolls only when the reader is at the bottom (already rule 10).

**Evidence (Phase 1, 2026-10-09, observed):** flow 240 on the simulator (iPhone 17 Pro, iOS 26.5),
40 filler messages, thread marked read so it opens at the bottom. On staging's screen and reducer
(control, bundle without `viewportShrank`): with the keyboard open the newest visible bubble is
"filler 35" and fillers 36–40 are under the keyboard (21:11 local). On the branch: "filler 40"
sits directly above the composer with the keyboard open, the sent bubble is visible above the
composer, and dismissing the keyboard leaves the thread at the bottom (21:08). Screenshots kept
at ~/levapp-pad569-evidence/ (branch `pad569-*`, control `control-pad569-*`). Read first: The reducer has no viewport event (`FollowEvent` union, `follow-state.ts`), the list's
`onLayout` dispatches only `{type: "layout"}` to the anchor reducer (`[id].tsx` ~L1270), and the
only `scrollToEnd` callers are the anchor effect, `contentGrew`, and `scrollToBottom` (send / jump).
So no code path moves the list when its height drops. Screenshots on staging's code vs the fix
(flow 240, 2×2) are the observation; recorded in the Resolution.

**Root cause:** the criterion "Composer stays docked to the keyboard" already promises "the latest
message remains visible above it", and rule 7 says so too. No test encodes that half (flow 141 of
B-265 checks the composer's position, not the thread's), so the code never had to. Type 7, missing
test — with the reducer missing the event that would have made it pass.

**Affected specs:** `.specflow/specs/messaging/conversation-detail.spec.md` rule 7 (clarified:
the thread follows the keyboard only while at the bottom, by rule 10) and a criterion that names the
four behaviours of the report. Business spec
`user-and-coach-message-in-real-time.business.md` journey step 6 already describes this; unchanged.

### Change Plan

- Spec: amend rule 7 with the follow-when-at-bottom clause; add criterion "The thread follows the
  keyboard (PAD-569)" with the four cases.
- `follow-state.ts`: new event `{ type: "viewportShrank" }` → effect `scrollToEnd` iff
  `atBottom && !suspended` (same gate as `contentGrew`); unit test red first (the reducer answers
  `null` today).
- `[id].tsx`: the FlatList `onLayout` keeps the last viewport height; once anchored, a smaller
  height dispatches `viewportShrank` and runs the effect one frame later (`requestAnimationFrame`,
  the Fabric rule from PAD-224). A larger height (keyboard closing) dispatches nothing: the native
  scroll view clamps the offset itself.
- iOS-only by nature (web has no soft keyboard); Android takes the same code path for free.
- Maestro flow 240 (student opens conversation 1, screenshot, focuses the composer, screenshot,
  sends, screenshot); read on the branch and on staging's code.

### Resolution

(filled in when the PR lands)
