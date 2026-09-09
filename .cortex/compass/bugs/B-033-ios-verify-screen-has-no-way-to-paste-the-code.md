---
id: B-033
title: "The iOS verify-email screen has no way to paste the code"
type: incomplete-rule
severity: high
status: triaged
affects:
  - auth.email-verification
  - frontend/apps/mobile/app/verify-email.tsx
proposed_fix: "A Paste code button under the cells reads the clipboard through expo-clipboard (loaded lazily), takes the first 6 digits and submits; a clipboard without a code shows a neutral hint."
opened: 2026-09-09T00:00:00Z
---

# B-033 — The iOS verify-email screen has no way to paste the code

**Source:** Linear PAD-251 §3 (real device, staging build 14, 2026-09-09): the code copied
from the mail cannot be pasted into the app; works on web.

**What happens:** the six cells are drawn `View`s; the real `TextInput` sits over them with
`caretHidden`, `color: "transparent"`, `opacity: 0.02` and `keyboardType="number-pad"`. iOS
anchors its Paste callout to a visible caret or selection, so there is nothing to long-press
and the number pad has no paste key. The person retypes six digits from another app.

**What should happen:** rule 8's "accepts a pasted 6-digit code" holds on iOS: one tap pastes
the code from the clipboard and submits it.

**Root cause:** Type 2 — incomplete rule. Rule 8 states the outcome ("accepts a pasted
6-digit code") and `onChangeCode` already collapses a pasted `"1 6 6 3 1 5"` to digits — but
the rule never says how paste is *reached* when the input is deliberately invisible, so the
overlay design shipped without an affordance. The Maestro flow types the code, so no test
covers paste (there is no way to set the simulator clipboard from a flow).

**Evidence (Phase 1):**
1. `frontend/apps/mobile/app/verify-email.tsx` `<TextInput … caretHidden style={{opacity:0.02,
   color:"transparent"}} keyboardType="number-pad" />` — the overlay in the ticket, unchanged
   on `origin/staging`.
2. Not device-verified in this session (no physical device); the mechanism is structural, and
   the fix does not depend on the OS callout at all.
3. `expo-clipboard ~8.0.8` is a declared dependency and is in build 14's `package.json`
   (e00714f); the messaging screen loads it lazily with a toast fallback for older binaries.

**Affected specs:**
- Dev: `.specflow/specs/auth/email-verification.spec.md` — rule 8 gains 8b; "Same flow on
  iOS" criterion names the button.
- Business: none.

### Change Plan

**Spec to modify:** `.specflow/specs/auth/email-verification.spec.md`
**Change type:** add rule 8b + criterion

1. Rule 8b (iOS only, with the reason): a **Paste code** button under the cells reads the
   clipboard, keeps the first 6 digits and submits them; a clipboard with no 6-digit run shows
   a neutral "no code in the clipboard" hint. Web needs no button: its real input accepts ⌘V,
   and browser clipboard-read either prompts (Chrome) or is unsupported (Firefox).
2. Criterion: "Paste on iOS" — with `166315` on the clipboard, tapping Paste code fills the
   cells and submits.
3. Test: no Maestro flow can set the clipboard — verified by hand in the simulator with
   `xcrun simctl pbcopy`; recorded in the PR.
4. Code: the button, the lazy `expo-clipboard` require, two locale strings (pt/en).

### Resolution

_pending_
