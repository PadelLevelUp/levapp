---
id: B-142
title: "Working hours cannot end at midnight: the server accepts 24:00, neither editor can express it"
type: incomplete-rule
severity: low
status: triaged
affects:
  - settings.coach-working-hours
  - frontend/packages/config/src/availability.ts
  - frontend/apps/mobile/src/components/ui/time-picker-input.tsx
proposed_fix: "An explicit per-window 'until midnight' affordance stored as 24:00 on both shells; not a change to the shared time field. PAD-379."
opened: 2026-09-21T19:14:00Z
---

# B-142 — the latest end a coach can save is 23:45

**Source:** Session-B's cross-review of #350 (2026-09-21), ruled on by the coordinator: document the
cap now, ticket 24:00 separately (PAD-379), because making both pickers express 24:00 is not small.

**What happens:** `validate_working_hours` accepts `end <= 24*60`. A web time input cannot show
24:00 and tops out at 23:59, which rule 6 snaps DOWN to 23:45; the mobile picker's parser refuses
24:00. A coach who works to midnight loses the last quarter hour.

**Evidence:** read from the code (`availability_service.py:60`, `snapToGrid`, `time-picker-input.tsx`);
`snapToGrid("23:59") === "23:45"` is pinned by a unit test. **Not run on a device.**

**Root cause:** rule 2 allows 24:00 and rule 3 never said how an editor expresses it.

### Change Plan

Decide first whether any coach needs it (product). If so: spec rule for an "until midnight" option
per window, both shells, stored as 24:00; then tests and code. Until then rule 6 records the cap.
