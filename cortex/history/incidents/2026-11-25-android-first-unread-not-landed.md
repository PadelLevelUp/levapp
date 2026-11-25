---
about: "Android: a thread whose first unread is behind the first page opens near the newest message on most nights (flow 114)"
permanence: stable
verified: "2026-11-25 (observed)"
origin:
  - report:docs/plans/ci-tools/m3/c/messages.md
need:
  - "frontend/apps/mobile/app/conversation/[id].tsx"
  - "frontend/apps/mobile/src/features/messages/open-sequence.ts"
  - "frontend/apps/mobile/.maestro/flows/114-thread-opens-at-first-unread.yaml"
aliases:
  - B-733
  - B-733-android-first-unread-not-landed
  - 2026-11-25-android-first-unread-not-landed
---

# B-733: on Android the thread often opens near the newest message, not at the first unread (flow 114)

**Source:** the ci-tools stream's reading of the Android nightlies of 2026-11-06 to 2026-11-13 on main 22f44cc71
(no artifacts for the 8th). Flow 114 is red on 06, 09, 10, 11 and 13 Nov, green on 07 and 12 Nov.

**What happens:** 40 unread, the first (id 64) behind the first page. The older page holding it is requested
(`before=74`), but the screen on 13 Nov shows messages 88 to 100, three short of the newest (103). No
`unread-divider` in the tree.

**What should happen:** `messaging.conversation-detail` rule 9a: the thread opens at the first unread, under the
divider.

**Cause (read in the source, not run):** the same landing code as [[2026-11-25-android-deep-link-never-lands-on-target]],
so the same candidate: Android cancels the animated landing when `maintainVisibleContentPosition` corrects the
offset, and whether the two meet depends on timing. The nightly variation fits a race. The stop three rows short of the newest does not fit a cut-short
animation, because the lane runs with animations disabled; it is unexplained.

**Observed on 2026-11-25 (Android lane run 45596805975, b8b34453d plus logging, 12 opens):** 0 of 4 unrepeated opens landed, two of them not animated; 2 of 2 landed with the scroll
repeated. The nightly's screen, three rows short of the newest, did not recur: these opens ended at the newest. That
detail stays unexplained.

**Ruled out (ci-tools):** flow 103's leftovers. Both green nights had the same preceding flows and the same deletes.
Request order alone does not separate red from green either (night 10 is red with the green order).

**Status:** open. The fix (rule 9c) is written; the Android lane has not run it yet.

```yaml
type: product-defect
severity: high
status: open
affects:
  - "messaging.conversation-detail"
  - "frontend/apps/mobile/app/conversation/[id].tsx"
proposed_fix: "Same fix as B-732; verify with flow 114 run several times, since it passes 2 nights in 7 unfixed."
```
