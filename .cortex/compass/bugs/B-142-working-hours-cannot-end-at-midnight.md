---
id: B-142
title: "Working hours cannot end at midnight: the server accepts 24:00, neither editor can express it"
type: incomplete-rule
severity: low
status: resolved
affects:
  - settings.coach-working-hours
  - frontend/packages/config/src/availability.ts
  - frontend/apps/mobile/src/components/ui/time-picker-input.tsx
proposed_fix: "Won't do (D118): rule 6's 23:45 cap stands. Midnight would mean classes crossing midnight; a feature ticket if the owner ever asks. PAD-379."
opened: 2026-09-21T19:14:20Z
resolved: 2026-09-22T20:36:30Z
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

### Resolution — won't do (D118, 2026-09-22)

**D117 (a per-window "Até à meia-noite" checkbox) was ruled and then superseded by D118** after a
probe showed what a student would meet.

**Probe (origin/staging 8dc17185d, a throwaway test, 20:35:26Z by `date -u`):**
- coach working hours `{day: [["20:00","24:00"]]}` save, and `free_blocks` advertises
  `("20:00","24:00")` to students;
- a student request 23:00–24:00 → **400 "date must be YYYY-MM-DD and times HH:MM"**:
  `class_request_service._parse_slot` runs `strptime("%H:%M")` on the end, which refuses "24:00";
- a request 22:45–23:45 → pending.

So an editor that could store 24:00 would make the student wizard offer a last slot that fails.
Honouring it means classes that end at 00:00 the next day, which touches class creation, the
calendar and the reminder code. That's high risk for a Low ticket nobody asked for.

**Decision D118 (coordinator):** close PAD-379 as won't do. Rule 6's documented cap (latest
saveable end 23:45) is the rule. If the owner ever asks for midnight, it becomes a feature ticket
covering requests and classes that end at midnight, not an editor tweak.

**Known, no ticket:** the server still ACCEPTS a stored `"24:00"` end (`validate_working_hours`,
`e <= 24*60`) and would then advertise a slot it refuses. It is reachable only through the raw
API: neither shell can send 24:00 (web `<input type=time>` tops out at 23:59 and snaps to 23:45;
the mobile picker refuses it).

