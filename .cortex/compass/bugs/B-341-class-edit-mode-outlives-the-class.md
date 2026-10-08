---
id: B-341
title: "Class edit mode outlived the class: the web sheet kept editing across a close and the next class rendered over the old draft; iOS back dropped the edit silently"
type: incomplete-rule
severity: high
status: resolved
resolved: 2026-10-07T19:33:00Z
affects:
  - classes.edit
  - frontend/apps/web/src/components/calendar/ClassDetailSheet.tsx
  - frontend/apps/mobile/app/class/[id].tsx
proposed_fix: "Edit mode and its draft belong to one class on one opening: closing the sheet, opening another class, or leaving the iOS screen ends edit mode; with unsaved changes (by value) it asks 'Descartar alterações?' with Discard / Keep editing first — no Save in the prompt."
opened: 2026-10-07T19:30:00Z
---

# B-341 — class edit mode outlived the class (id unconfirmed, Session C range B-341–B-360)

**Source:** PAD-525, reported by the founder via Discord, 2026-10-05: "editing a class and leaving
without saving (navigating to another class), the app keeps showing the edit state as if still
editing the previous class."

**What happens (web, read at staging `7db0e3f4a`):** `CalendarPage` renders ONE `ClassDetailSheet`
with `open={!!selectedClassEvent}`. Closing it (X, Escape, click outside) sets the event to null
and the sheet stays mounted. Its `[event]` effect returns early on null and nothing resets
`isEditing` or `draft` (`ClassDetailSheet.tsx` :158–159, :277–298). The next click opens another
class into the same component: `isEditing` is still true, `active = draft ?? classInstance`
(:375) is still the OLD class's draft, so the new panel shows the old class's name, time and
roster in edit mode. Only the explicit Cancel or a Save clears it.

**What happens (iOS):** `app/class/[id].tsx` offers edit mode with Cancel/Save (:1710–1740) and a
back button that calls `router.back()` (:893) with no check; a swipe back does the same. The
draft is dropped without a word. The next opening is clean because the screen unmounts.

**Reproduced:** `e2e/schedule-calendar/pad525-edit-mode-does-not-leak.spec.ts` (red before the
fix: after closing the sheet mid-edit, class B opened with `class-edit-save` visible and the
name input reading class A's typed name). Run recorded in the PR.

**Root-cause class:** `classes.edit` had rules for what an edit sends and at which scope, and no
rule for an edit that is abandoned. Incomplete rule.

**Fix:** `classes.edit` rule 10 (unconfirmed number). Web: a close while unsaved asks; a close or
an event change ends edit mode. iOS: back/swipe/removal while unsaved asks (`usePreventRemove`,
swipe off), a param change ends edit mode. Discard / Keep editing, no Save — see the rule for why.
