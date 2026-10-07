---
id: B-344
title: "Web calendar: after creating, editing or deleting a class only the clicked card changed; other occurrences stayed stale until a reload"
type: incomplete-rule
severity: medium
status: resolved
resolved: 2026-10-07T22:20:00Z
affects:
  - calendar.view
  - frontend/apps/web/src/pages/CalendarPage.tsx
proposed_fix: "After a class write the page keeps its local patch of the clicked card and then re-reads the range on screen (readRange), as block saves, drag reschedules and PAD-488's events already do."
opened: 2026-10-07T22:20:00Z
---

# B-344 — the web calendar kept stale cards after a class write (id unconfirmed, Session C range)

**Source:** PAD-526, reported by the founder via Discord: on desktop, an edited and saved class did
not show its changes on the calendar until a page refresh.

**Observed (read at staging):** `CalendarPage.handleEditClass` calls `editClass` and then patches
only the clicked card from the sent diff (`instanceToCalendarEvent(updated, e)`).
`handleDeleteClass` drops only the clicked card, and `handleSaveClass` appends only the one event
the create answered with. None of them re-reads the range. A class write can reach other
occurrences: a recurring class has several in a week, and a "this and future" edit or delete
changes every later one. Those cards stayed as they were. Calendar-block saves, drag reschedules and
PAD-488's request events already call `readRange`. iOS was already right: its class mutations
invalidate the calendar query on success.

**Root-cause class:** `calendar.view` said nothing about the calendar after a write, so each
handler chose its own patch. Incomplete rule. Fix: rule 18 (number unconfirmed).

**Reproduced:** `e2e/schedule-calendar/pad526-calendar-refreshes-after-class-write.spec.ts`. Run
recorded in the PR.
