---
id: B-152
title: "Marking a student present after 'absent, justified' left the justification on the present row"
type: incomplete-rule
severity: medium
status: resolved
affects:
  - attendance.validation
  - backend/padel_app/services/lesson_service.py
  - backend/padel_app/services/notification_service.py
proposed_fix: "lesson_service.add_presences clears justification whenever the recorded status is present, whatever the body carries."
opened: 2026-09-21T19:00:00Z
resolved: 2026-09-21T19:50:00Z
---

# B-152 — a present row that still said "justified"

**Source:** Session-C, 2026-09-21, pinned at the route while mapping PAD-367 (number from C's
extended range; ticket PAD-381). Split out by the coordinator as a DOMAIN rule, moved to Session D.

**What happened (reproduced by Session D with its own route-level tests, 19:44 UTC, staging
00e53375f):** `POST /api/app/class_instance/presences/confirm` with `absent` + `justified`, then
`present` — the row ended `('present', 'justified')` in all four body shapes: `justification: ""`,
`null`, a stale value, and **the key omitted**.

**Reach, read from the code (the ticket listed both as not checked):**
- Every client sends the omitted-key shape: web `AttendanceRow.tsx:74` and iOS
  `ParticipantRow.tsx:82` mark present with `justification: undefined`; the App Store builds do
  the same (Session-C's read). So EVERY absent → present correction left the stale value.
- It is not cosmetic. `notification_service._has_makeups` counts `justification == "justified"`
  and `_unjustified_absence_count` counts `justification == "unjustified"`, **neither filtering
  on `status`** — a corrected row went on counting as a make-up owed, or as an unjustified
  absence, in the invitation engine's grouping. `attendance.absences` reads `status == "absent"`
  first, so the student-facing history was not affected.

**Where the wrong value first appears:** `add_presences` passes `justification` through the form
layer, which leaves an empty, null or absent value alone. Correct for the form layer (PAD-367: an
absent key is left alone); wrong for this route, where absence of the key IS "no justification".

**Affected specs:**
- Dev: `.specflow/specs/attendance/validation.spec.md`
- Business: `.specflow/specs-business/attendance/coach-finalizes-attendance-records.business.md` (no drift)

### Change Plan

Add `attendance.validation` rule 21 + criterion; route-level tests first (they fail); fix in
`add_presences` only.

### Resolution

- Spec changes: rule 21 and its criterion.
- Tests added: `test_pad381_present_clears_the_justification.py` (8): 4 failed / 4 passed on the old
  code — the four failures are the absent → present cell in its four body shapes, the four passes
  the other cell (a first present mark; an absence whose justification changes, is set, or is
  omitted) — and 8/8 on the fix, 8/8 on Postgres; 466 passed across the 41 neighbouring files.
- Code changes: `lesson_service.add_presences`. Backend only; neither shell changes, because both
  already send what the rule expects.
- NOT done here: (a) rows already stale are not repaired, and how many there are is not measured —
  `SELECT count(*) FROM presences WHERE status = 'present' AND justification IS NOT NULL` would say;
  (b) the two engine queries still do not filter on `status` — raised with the coordinator, not
  touched, because `notification_service.py` is other sessions' area this wave; (c) un-marking.
- Session-C's pin `test_attendance_a_justification_cannot_be_cleared_and_a_mark_cannot_be_undone`
  (#354) asserts the old behaviour: its first three assertions flip, its control stays; flipped by
  this PR's author once #354 is on staging.
- Resolved: 2026-09-21 (PAD-381).
