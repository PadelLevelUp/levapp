---
about: "Android: after sending, the thread does not scroll to the sender's own message when it overflows the keyboard-open viewport (flow 09)"
permanence: stable
verified: "2026-11-25 (inferred)"
origin:
  - report:docs/plans/ci-tools/m3/c/messages.md
need:
  - "frontend/apps/mobile/app/conversation/[id].tsx"
  - "frontend/apps/mobile/src/features/messages/follow-state.ts"
  - "frontend/apps/mobile/.maestro/flows/09-direct-messages.yaml"
aliases:
  - B-731
  - B-731-android-own-message-not-scrolled-into-view
  - 2026-11-25-android-own-message-not-scrolled-into-view
---

# B-731: on Android the sent message stays out of view (flow 09)

**Source:** the ci-tools stream's reading of the Android nightlies of 2026-11-06 to 2026-11-13 on main 22f44cc71
(no artifacts for the 8th). Flow 09 is red on 06, 07, 09, 10, 12 and 13 Nov, green on 11 Nov.

**What happens:** with the keyboard open, the coach sends "Maestro message". `POST /api/app/message` answers
201 and the composer clears, but 15 s later the bubble is nowhere in the view tree and the list is at, or
within 40 px of, the top.

**What should happen:** `messaging.conversation-detail` rule 10: the user's own message always scrolls to the bottom.

**What separates red from green (observed):** flow 80 leaves "added" and "class cancelled" bubbles in the same
conversation. The one green night is the one where 80 failed early and left a shorter thread. So the trigger
is a thread that overflows the keyboard-open viewport.

**Cause: not proven.** Read in the code on b8b34453d:
- `handleSend` writes the optimistic row and calls `scrollToBottom(true)` in the same turn. The row has not been
  committed, so `scrollToEnd` aims at the end of the list without it.
- The second chance is `contentGrew` (`follow-state.ts`), which re-pins only while `atBottom` is true. A frame of the
  animated scroll that reports more than 100 dp from the end clears it.
- React Native 0.81.5 for Android: the `scrollTo` command calls `abortAnimation()`, which stops the OverScroller but
  not the animator behind an animated scroll (`ReactScrollView.java:238`). A non-animated jump made while that
  animator runs is overwritten on its next frame.

- The thread opened at its first unread, near the top (rule 9a), so following was suspended when the keyboard opened
  and the list did not re-pin then.

These do not explain the red nights. The overwrite needs an animation still running when the row is laid out, and the
lane runs with animations disabled (`disable-animations: true`), so it lasts about one frame. On a phone with animations
on the overwrite is possible. The lane's cause is unknown until a run with logs (offsets, `contentGrew`, `atBottom`).

**Not checked:** whether a person sees it on a real phone; iOS shows no failure in flow 09.

**Status:** open. No fix chosen.

```yaml
type: product-defect
severity: medium
status: open
affects:
  - "messaging.conversation-detail"
  - "frontend/apps/mobile/app/conversation/[id].tsx"
  - "frontend/apps/mobile/src/features/messages/follow-state.ts"
proposed_fix: "Scroll to the end after the optimistic row is committed, not in the same turn, and not animated on Android. Not to be built before a logged run shows why the second scroll does not take."
```
