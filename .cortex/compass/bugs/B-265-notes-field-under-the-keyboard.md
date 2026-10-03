---
id: B-265
title: "On iOS the class-request wizard's notes field stayed under the keyboard"
type: incomplete-rule
severity: medium
status: triaged
affects:
  - .specflow/specs/mobile/android-runtime.spec.md
  - frontend/apps/mobile/app/class-request-wizard.tsx
  - frontend/apps/mobile/app/conversation/new.tsx
  - frontend/apps/mobile/src/lib/native-header-offset.ts
  - frontend/apps/mobile/src/lib/scroll-to-end-on-keyboard.ts
proposed_fix: "Screens under a native stack header pass the header's height as keyboardVerticalOffset; the wizard scrolls its focused last field above the keyboard."
opened: 2026-10-02T18:21:05Z
---

# B-265: the notes field under the keyboard

**Source:** PAD-487 (reported in Discord): asking for a private class on iOS, typing in "notas
opcionais" leaves the field behind the keyboard; the screen does not follow it.

**What happens:** `app/class-request-wizard.tsx` is a KeyboardAvoidingView (`behavior:
"padding"`, the shared policy) wrapping the ScrollView. The screen shows a native stack header
(`headerShown: true`) and passes no `keyboardVerticalOffset`. React Native 0.81 pads by
`frame.y + frame.height − keyboard.screenY` (`KeyboardAvoidingView.js:109`), where `frame` comes
from `onLayout`, which is relative to the parent, while the keyboard's Y is in window
coordinates. Under the header (about 100 pt on an iPhone 17 Pro) the view shrinks that much too
little, so the bottom of the scroll area, where the notes Textarea sits before Send, stays
under the keyboard and cannot be scrolled into view.

**Other screens:** every caller of `keyboardAvoidingBehavior()` was surveyed. Only one other
screen has a native header: `app/conversation/new.tsx`, which has the same fault. The root stack
is `headerShown: false` (`app/_layout.tsx:83`); the auth screens, event/class editors, the
evaluation screens and the chat draw their header inside the view, so their frame is right. The
one text box inside a native Modal (BlockerSheet) is a full-screen Modal with no header.

**Evidence (Phase 1):** from React Native's source and the screens' layout, as above.
**Unreproduced so far:** the simulator was under the release-gate quiet on 2026-10-02. To do:
screenshots of the focused field on staging's code and on the fix (Maestro cannot tell covered
from visible).

**Correction after the first simulator runs (2026-10-02, flow 141):** on staging's code both
fields were behind the keyboard (18:58Z and 19:06Z). With the header offset alone (19:15Z) the
new-conversation field was above the keyboard, but the wizard's note was still covered. The view
now shrank by the right amount, but the wizard's ScrollView kept its offset, so the note stayed
where the keyboard now is. The new-conversation field is the list's footer and lands in view by
itself. **Second cause:** nothing scrolls the focused bottom field into view. Fix: the note's
focus arms `useScrollToEndOnKeyboard`, and on `keyboardDidShow` (iOS and Android) the form scrolls
to its end.

**Root cause:** `mobile.android-runtime` rule 2 fixed the `behavior` for every screen but said
nothing about the offset a screen under a native header needs (Type 2).

### Change Plan
- Rule 2: screens under a native header pass the header's height through
  `useNativeHeaderKeyboardOffset()`; one criterion.
- Code: the wizard and the new-conversation screen; `@react-navigation/elements` (already installed
  transitively at 2.9.40) becomes a direct dependency.
- Tests: a unit test that both screens pass a non-zero offset equal to the hook's value (mutant
  "offset 0" red); Maestro flow 141 with screenshots, red on staging and green on the fix.

### Resolution

(open)
