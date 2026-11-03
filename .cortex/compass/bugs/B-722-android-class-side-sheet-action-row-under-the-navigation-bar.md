---
id: B-722
title: "On Android the class side sheet's Cancel / Send row sat under the navigation bar, so a student could not send a join or waiting-list request"
type: incomplete-rule
severity: medium
status: resolved
affects:
  - mobile.android-runtime
  - frontend/apps/mobile/src/features/calendar/ClassSideSheet.tsx
proposed_fix: "android-runtime rule 9c: the side sheet adds the bottom safe-area inset to its bottom padding on Android; iOS keeps 20 pt."
opened: 2026-11-02T11:53:46Z
resolved: 2026-11-02T12:20:00Z
---

# B-722: the class side sheet's action row was under the Android navigation bar

**Source:** Linear PAD-817, from the PAD-816 classification of the Android lane's standing reds
(nightly 41296614870 on main 475420d9d).

**What happens:** a student asks to join an academy class, or a full class's waiting list, and the side
sheet ("Which side do you want to play in this class?") opens. On Android its Cancel / Send row
(`class-side-cancel`, `class-side-send`) is drawn behind the system navigation bar. With 3-button
navigation it cannot be tapped, and the request cannot be sent.

**What should happen:** the row is above the navigation bar and can be tapped, as on iOS.

**Root cause:** the app draws edge to edge on Android (`app.json` `edgeToEdgeEnabled: true`), so a bottom
sheet in a `Modal` runs under the navigation bar. `ClassSideSheet` padded its sheet by a flat 20 pt with
no bottom inset, unlike the other sheets (`BlockerSheet`, the shared select). `mobile.android-runtime`
already had rule 9b for a select's list between the system bars, but no rule for a bottom sheet's action
row. That makes it an incomplete rule.

**Evidence:** run 41440477478, dispatched on staging 3e0a11a9d with flows 65 and 66 only,
2026-11-02 12:07–12:13Z. Both failed on `tapOn id class-side-send` ("Element not found: Id matching regex:
class-side-send"), 0 passed and 2 failed. The failure screenshots show the row behind the 3-button bar.
The 1 Nov nightly failed the same way, with no JS error in logcat.

**Affected specs:**
- Dev: `.specflow/specs/mobile/android-runtime.spec.md` (new rule 9c and one criterion)
- Business: none (`mobile.app-runs-on-android` already expects every screen to work on Android)

### Change Plan
1. Spec: rule 9c and its criterion.
2. `side-sheet-layout.ts`: `sideSheetPaddingBottom(os, insets)` is 20 + bottom inset on Android and 20 on iOS.
3. `ClassSideSheet`: `paddingBottom: sideSheetPaddingBottom(Platform.OS, useSafeAreaInsets())`.
4. Unit test `side-sheet-layout.test.ts`; device proof: flows 65 and 66 on the Android lane, dispatched on
   the branch.

### Resolution
- Spec changes: `mobile.android-runtime` rule 9c, criterion "The class side sheet can be sent on Android".
- Tests added: `frontend/apps/mobile/src/features/calendar/side-sheet-layout.test.ts`.
- Code changes: `side-sheet-layout.ts` (new), `ClassSideSheet.tsx` (bottom padding).
- Resolved: 2026-11-02 (PAD-817). The Android lane run on the branch is named in the PR.
