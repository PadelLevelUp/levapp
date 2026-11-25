---
about: "Phone: the thread's jump-to-latest control is partly covered by the composer, on iOS and Android; web is not affected"
permanence: stable
verified: "2026-11-25 (observed)"
origin:
  - report:docs/plans/messages/android-thread/ios-check/README.md
need:
  - "frontend/apps/mobile/app/conversation/[id].tsx"
aliases:
  - B-734
  - B-734-phone-jump-control-cut-off-by-composer
  - 2026-11-25-phone-jump-control-cut-off-by-composer
---

# B-734: the phone's jump-to-latest control is cut off by the composer

**Source:** seen by the messages stream during the attended iOS check of #1028, and on the Android lane's screenshots of
run 45596805975 (b8b34453d plus logging). The control's code is older than both.

**What happens:** with the thread scrolled up, only the top of the round control shows; the composer covers the rest.

**What should happen:** the control is fully visible above the composer (`messaging.conversation-detail` rule 12).

**Cause (read in the code on 3c153769e):** the control is positioned against the whole screen column, `absolute bottom-24`,
not against the list. `bottom-24` is a fixed guess of the composer's height; with a 14 pt rem it is 84 pt. The composer
with the home indicator (or Android's navigation bar) is taller than that, is painted after the control and is opaque. A
reply preview or the edit composer makes it taller still.

**Web is not affected (measured on 3c153769e, Chromium, 320, 375, 430 and 1280 wide):** the control sits inside the list's
own box, which ends where the composer starts. At every width it ends 16 px above the list's bottom edge and is the top
element at its top, middle and bottom.

**Status:** open.

```yaml
type: product-defect
severity: low
status: open
affects:
  - "messaging.conversation-detail"
  - "frontend/apps/mobile/app/conversation/[id].tsx"
proposed_fix: "Position the control inside the list's own box, as web does, so it clears the composer whatever its height."
```
