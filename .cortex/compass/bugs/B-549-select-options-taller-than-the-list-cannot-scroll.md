---
id: B-549
title: "A select whose options are taller than its list box could not scroll on iOS or Android: the level select stopped at about nine levels"
type: incomplete-rule
severity: medium
status: resolved
resolved: 2026-10-14T21:00:00Z
affects:
  - .specflow/specs/mobile/android-runtime.spec.md
  - frontend/apps/mobile/src/components/ui/select.tsx
proposed_fix: "The shared SelectContent puts its options in a ScrollView bounded inside the max-h-96 box (keyboardShouldPersistTaps handled); rule 9b says every select's options scroll when taller than the list."
opened: 2026-10-14T20:25:00Z
---

# B-549: a long select could not scroll

**Source:** PAD-655, reported by a coach via Discord: iOS, Edit student → Nível, the list does
not move up or down, so the other levels cannot be chosen.

**What happens:** the shared `SelectContent` (`components/ui/select.tsx`) caps the list box at
`max-h-96` and renders the options inside `SelectPrimitive.Viewport`. On native,
`@rn-primitives/select`'s `Viewport` is `({ children }) => <>{children}</>` — a fragment — so
nothing inside the box scrolls. A list taller than the box draws past it and past the bottom of
the screen, and swiping does nothing. Every select in the app goes through this component.

**What should happen:** the options scroll inside the box; the last one can be reached and chosen.

**Root cause (Type 2, incomplete rule):** `mobile.android-runtime` rule 9 makes a portalled
surface reachable (Android hit-testing, B-067) but no rule said a list taller than its box must
scroll, and the library's native `Viewport` does not.

**Evidence (Phase 1):** reproduced on the pinned iOS simulator with Maestro flow 280 on staging
81da65783: 16 levels, six swipes on the list, "P655-14 | Scroll 14" never visible; the failure
screenshot shows the list open from the phone field down past the screen edge, still on
I1…P655-07. The library source (`@rn-primitives/select/dist/select.mjs:333`) shows the fragment.
On the fix, the same flow reached, tapped and closed on the last level (run 2026-10-14_203901,
all those steps COMPLETED); its trigger-text read was removed because iOS does not expose a
select's value to Maestro. Unit guard `src/components/ui/select.scroll.test.ts` red before, green after.

**Fix:** a `ScrollView` (max height 384 − padding − border, `keyboardShouldPersistTaps="handled"`,
`nestedScrollEnabled`) inside the shared `SelectContent`.
