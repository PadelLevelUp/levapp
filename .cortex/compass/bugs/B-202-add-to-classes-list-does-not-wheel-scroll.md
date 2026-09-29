---
id: B-202
title: "Web \"Add to classes\" picker: the class list could not be scrolled by wheel or trackpad"
type: missing-criterion
severity: high
status: resolved
affects:
  - players.profile
  - frontend/apps/web/src/components/players/detail/AddToClassesDialog.tsx
proposed_fix: "Replace Radix ScrollArea with a native overflow-y-auto list inside the Dialog. Rule 5c plus a criterion; an E2E test scrolls with the mouse wheel."
opened: 2026-09-24T22:14:03Z
resolved: 2026-09-25T14:58:45Z
---

# B-202: the add-to-classes list did not wheel-scroll

**Source:** owner feedback, PAD-439 (desktop). With many classes in a week, the lower ones were hidden behind the Cancel/Add footer, the list would not scroll, and Friday to Sunday were unreachable.

**What happens:** the list was a Radix `ScrollArea` inside a Radix `Dialog`. The dialog's scroll lock (`react-remove-scroll`) blocks wheel events it doesn't attribute to a scrollable element, and ScrollArea's viewport was not recognised. So wheel and trackpad scrolling did nothing, while programmatic scrolling (`scrollIntoView`) still worked.

**What should happen:** the list scrolls between a fixed header and footer (rule 5c).

**Root cause:** Type 1, a missing criterion. Rule 5 describes the picker's content, but no criterion covered reaching a class below the fold. The existing E2E test listed one class and never scrolled.

**Evidence (Phase 1, 2026-09-25, isolated stack):**
- An E2E test with next week's seeded classes at 1280×520: after `scrollIntoViewIfNeeded()` it PASSED on the old code, in Chromium and in WebKit. Programmatic scrolling hides the bug.
- The same test, scrolling by `mouse.wheel` over the list: FAILED on the old code in Chromium and in WebKit (last class bottom at 570px, footer top at about 405px); PASSED after the fix in both.
- The dialog is identical on `main`, so the owner saw this code.

### Resolution
- Spec: `players.profile` rule 5c and the criterion "A long week scrolls inside the picker".
- Test: `e2e/players/add-to-classes-week.spec.ts` (wheel scroll).
- Code: `AddToClassesDialog.tsx`, where the list is a native `overflow-y-auto overscroll-contain` div.
