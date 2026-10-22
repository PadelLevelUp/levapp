---
id: B-605
title: "Android: a select near the bottom of a form opened its list under the navigation bar, so the last options could not be reached"
type: incomplete-rule
severity: medium
status: resolved
resolved: 2026-10-22T09:30:00Z
affects:
  - frontend/apps/mobile/src/components/ui/select.tsx
  - .specflow/specs/mobile/android-runtime.spec.md
proposed_fix: "On Android, pass the safe-area insets plus a gap to the select popper and cap the list to the height between them; iOS unchanged."
opened: 2026-10-22T02:29:00Z
---

# B-605: the Android select list ran under the navigation bar

**Source:** the Android lane, flow `280-level-select-scrolls`. It failed on nightly shard run 39691332376 and on the changed jobs of #785 and #803 with `"P655-14 | Scroll 14" is visible` false. Filed as PAD-727.

**Root cause:**
- The app draws edge to edge on Android (`app.json` `edgeToEdgeEnabled`), so the window runs under the status and navigation bars.
- `SelectContent` (`src/components/ui/select.tsx`) passed no `insets` to `@rn-primitives/select`'s popper. Its `avoidCollisions` keeps a list inside the window, but measured without the bars it let the bottom of a 384 pt list sit under the 48 dp navigation bar.
- Rule 9b (PAD-655) made the list scroll, but said nothing about where the list may go. So: an incomplete rule.

**Fix (PAD-727):**
- `selectListLayout` gives the popper the safe-area insets plus 8 pt on Android, and caps the list's ScrollView to the room between them.
- A list with no room below its trigger moves up until it fits. iOS gets the same values as before.
- Rule 9b has an Android sentence and a new criterion.
- `select.safe-area.test.ts` (6 tests) pins the sizing and its use in `SelectContent`. Flow 280's BLOCKED header is gone, and flow 280 is the device guard.
