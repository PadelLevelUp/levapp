---
id: R-026
title: "A clickable card or list row is a real control, not a styled div with onClick"
source:
  - ../../../.specflow/specs/players/list.spec.md
  - ../../../.specflow/specs/calendar/view.spec.md
  - ../../../.specflow/specs/dashboard/navigation.spec.md
  - ../../../.specflow/specs/attendance/history.spec.md
governs:
  - "frontend/apps/web/src/**/*.tsx"
  - "frontend/apps/mobile/app/**/*.tsx"
  - "frontend/apps/mobile/src/**/*.tsx"
confidence: MEASURED
status: active
---

# R-026 — A clickable card or list row is a real control, not a styled div with onClick

If an element has an `onClick` and `cursor-pointer`, it is a control and must be built as one:

1. **Focusable** — a native `<button>`/`<a>`, or `role="button"` + `tabIndex={0}`.
2. **Named** — an accessible name that identifies the row (the player's name; the class
   title and time), not just whatever text happens to be inside.
3. **Keyboard-activatable** — Enter **and** Space. With `role="button"` you must write the
   handler yourself, and Space must `preventDefault()` or the page scrolls instead.
4. **Visibly focused** — `focus:outline-none focus-visible:ring-2 focus-visible:ring-ring`.

Prefer a native `<button>`. Fall back to `role="button"` when a button would be illegal or
would break behaviour — the element is an HTML5 drag source, or its subtree contains `div`s,
or a `role="progressbar"`. Both fallbacks already exist in-repo: `ClassListBlock` is the
native case, `AttendanceHistoryList` and `CalendarEventCard` the `role="button"` case.

On iOS the equivalent is `Pressable` with `role="button"` and `accessibilityLabel`; keyboard
reachability has no iOS analogue but the accessible name does, and VoiceOver needs it just as
much. Web and iOS are held to this together (R-024).

**Why:** four separate specs had to state this rule independently, and it was still missed
twice. PAD-148 (weekly QA sweep, 2026-08-30) measured the cost: on `/players`, Tab walked
past **all 27** player cards straight from the search box to the pagination buttons, and on
`/calendar` the class cards were bare `generic` nodes in the accessibility tree. Opening a
player or a class is the entry point to evaluations, level/side, attendance, class edit,
notify and delete — so the whole coach workflow was mouse-only, on both surfaces, in a
product that already had this rule written down twice.
