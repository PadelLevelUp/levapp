---
about: "Android: a ?message= deep link (the push-tap route) never lands on an older message; the thread stays at the newest (flow 103)"
permanence: stable
verified: "2026-11-25 (observed)"
origin:
  - report:docs/plans/ci-tools/m3/c/messages.md
need:
  - "frontend/apps/mobile/app/conversation/[id].tsx"
  - "frontend/apps/mobile/src/features/messages/target-landing.ts"
  - "frontend/packages/hooks/src/messageTarget.ts"
  - "frontend/apps/mobile/.maestro/flows/103-thread-lands-on-target-message.yaml"
aliases:
  - B-732
  - B-732-android-deep-link-never-lands-on-target
  - 2026-11-25-android-deep-link-never-lands-on-target
---

# B-732: on Android a push-target open stays at the newest message (flow 103)

**Source:** the ci-tools stream's reading of the Android nightlies of 2026-11-06 to 2026-11-13 on main 22f44cc71
(no artifacts for the 8th). Flow 103 is red on all seven nights with artifacts.

**What happens:** `levelup://conversation/1?message=21` opens the thread, the older page holding id 21 is requested
(`before=34`), and the screen shows messages 51 to 63, the newest.

**What should happen:** `messaging.push-notifications` rule 12: the thread lands on the target message.

**Cause (read in the source, not run):** an Android-only difference that our single-shot landing does not survive.
- The screen lands with one animated `scrollToIndex`, one frame after the older page arrives, and clears the target
  first, so nothing checks or repeats it (`[id].tsx`, the landing effect and `scrollToMessage`).
- `maintainVisibleContentPosition` is on once anchored. On Android its helper corrects the offset after every mount
  that moves the anchor row, through `scrollToPreservingMomentum`, and that calls `recreateFlingAnimation`, which
  CANCELS a running animated scroll (React Native 0.81.5, `ReactScrollView.java:1205-1211` and `:1242-1245`;
  `MaintainVisibleScrollPositionHelper.kt`, `updateScrollPositionInternal`).
- Order inside one Android mount batch (`MountItemDispatcher.kt:147-248`): the anchor row is recorded, then view
  commands run, then the rows mount, then the correction runs. If our scroll command lands in the batch that mounts the
  older page, it starts first and is cancelled by that page's own correction: the thread stays at the newest.
- A non-animated scroll in the same batch would be wrong too: the correction adds the height of the prepended rows to it.
  So turning the animation off is not a fix by itself.
- `onScrollToIndexFailed` (rule 9b's retry) does not fire: `_highestMeasuredCellIndex` still holds the first page's
  29, so an unmeasured prepended row counts as measured and gets an estimated offset.

The lane's emulator runs with animations disabled (`disable-animations: true` in `android-build.yaml`), so there the
animation lasts about one frame. That leaves the same-batch cancel possible and nothing slower. On a phone with
animations on it lasts about 250 ms, so any later correction can also cancel it.

**Observed on 2026-11-25 (Android lane run 45596805975, b8b34453d plus logging, 12 opens):** the landing was issued in every open, and no offset after it moved toward the
target unless the scroll was issued again. Unrepeated, 103 and 114 together: 0 of 6 landed (three as the app is, three
not animated). With the same scroll repeated at 400 and 800 ms: 3 of 3 landed. One repeat made at 400 ms, while the
older page was still being measured, did not land; the one at 800 ms did. So the scroll is undone while the page settles,
and turning the animation off is not a fix. The run shows the outcome, not which native step undoes it.

**Related:** [[2026-09-26-a-landing-is-cancelled-by-rule-10-re-pinning]] (iOS, fixed) and
[[2026-11-25-android-first-unread-not-landed]] (same landing code).

**Status:** open. The fix (rule 9c) is written; the Android lane has not run it yet.

```yaml
type: product-defect
severity: high
status: open
affects:
  - "messaging.push-notifications"
  - "messaging.conversation-detail"
  - "frontend/apps/mobile/app/conversation/[id].tsx"
proposed_fix: "On Android, after landing, check that the target row is in view and repeat the scroll by message id until it is, bounded, ending when the reader drags."
```
