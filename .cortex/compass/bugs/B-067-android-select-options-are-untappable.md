---
id: B-067
title: "Android: no select option can be tapped — the portal wrapper has no size, so the list renders outside its parent's bounds"
type: incomplete-rule
severity: high
status: resolved
affects:
  - mobile.android-runtime
  - frontend/apps/mobile/src/components/ui/select.tsx
proposed_fix: "Make the select's portal wrapper fill the overlay (absoluteFill + pointerEvents box-none) so the absolutely positioned option list lies inside its parent's bounds; geometry is unchanged on both platforms."
opened: 2026-09-12T09:30:00Z
resolved: 2026-09-12T09:40:00Z
---

# B-067 — Android: select options cannot be tapped

**Source:** PAD-304's Android lane, runs 34652818471 and 34655309969, flow
`12-settings-language`. Session F.

**What happens:** on Android, tapping a select trigger opens the option list on screen, and
then nothing can be selected. Every option is inert to touch. The same list is also absent
from the accessibility tree, so a screen reader cannot reach it and Maestro reports
`Element not found: Id matching regex: settings-language-pt` while the options are plainly
visible in the screenshot taken at that moment. Every select in the app is affected — language,
level, coach, class pickers — so an Android user cannot change any value that a select owns.

**What should happen:** an option responds to a tap on both platforms, and is exposed to
accessibility, exactly as it is on iOS.

**Root cause (`frontend/apps/mobile/src/components/ui/select.tsx`, `SelectContent`):** the
portal renders `Overlay (absoluteFill) → Animated.View → Content`. The content is absolutely
positioned (`position="popper"`, placed from the trigger's page coordinates), so the
`Animated.View` between them has no in-flow child and shrink-wraps to 0 × 0. The option list
is therefore laid out **outside its parent's bounds**. iOS delivers touches to such a child
and exposes it to the accessibility tree; Android does neither — `ViewGroup` hit-testing stops
at the parent's bounds, and the node is reported as an invisible child. Android still *draws*
it, because a parent does not clip its children unless asked to, which is why the list looks
normal in a screenshot while being unreachable.

Evidence, from run 34655309969: the failure screenshot shows the language dropdown open with
"Português" and "✓ English"; the accessibility hierarchy captured at the same step contains
the settings screen and no dropdown nodes at all; the device log skips a zero-height,
full-width node (`boundsInParent: Rect(0, 0 - 1080, 0)`) at each hierarchy read.

The dialog primitives escaped this: `dialog.tsx` and `alert-dialog.tsx` give the same wrapper
`alignSelf: "stretch"` (PAD-102, for an unrelated width-collapse bug) and their content is
in normal flow, so the wrapper has real bounds.

### Change Plan

**Spec to modify:** `.specflow/specs/mobile/android-runtime.spec.md` — **rule 9**, "a portalled
surface must be reachable by touch and by accessibility", with the criterion "A select option
can be picked on Android".

**Code:** `frontend/apps/mobile/src/components/ui/select.tsx` — the wrapper takes
`style={StyleSheet.absoluteFill}` and `pointerEvents="box-none"`, so the list lies inside its
parent and a tap outside it still falls through to the overlay that closes it. The content's
own origin does not move, so neither platform changes visually.

**Test:** Maestro flow 12 taps `settings-language-pt` / `-en` by id on both platforms; the iOS
percent taps it used to need are removed by the same change.

### Aftermath — a test that could only pass while the feature was broken

Fixing this exposed a second defect in the flow that covers it, worth recording on its own.
`12-settings-language` confirmed each language switch by asserting the English sentence
"Language preference saved.". That status line is rendered in the language just chosen —
`preferences-section.tsx` deliberately holds the translation key rather than the resolved
string, so that switching to Portuguese does not report success in English. So the English
assertion could only pass while the switch had **not** taken effect: for as long as the option
was untappable, the flow certified the broken behaviour as working.

When the fix landed, the switch worked, the assertion failed, and the flow stopped before its
second step — leaving the coach's stored language as Portuguese for the rest of the suite.
Flows 16 and 34 then failed on English strings of their own ("Reminders sent", "Disconnect"),
for a reason that had nothing to do with what they test; the remove button coming back as
"Desassociar" in the Android hierarchy is what named it. The flow now asserts
`settings-language-status` by id, and the Maestro README records the order hazard.

### Resolution

- Spec changes: `mobile.android-runtime` rule 9 and its criterion.
- Tests: `12-settings-language.yaml` — both platforms tap the option by id, and the saved
  status is asserted by id rather than by a sentence that only matched while the switch was
  broken (see Aftermath).
- Code: `select.tsx` wrapper fills the overlay.
- Resolved: 2026-09-12 (PAD-304).
