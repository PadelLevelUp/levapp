---
id: B-152
title: "Marking a student present after 'absent, justified' left the justification on the present row"
type: incomplete-rule
severity: medium
status: triaged
affects:
  - attendance.validation
  - backend/padel_app/services/lesson_service.py
  - backend/padel_app/services/notification_service.py
proposed_fix: "lesson_service.add_presences clears justification whenever the recorded status is present, whatever the body carries."
opened: 2026-09-21T19:00:00Z
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
- **Second half, on the coordinator's decision (option a), proven by RUNNING the engine, not by
  reading it:** `_has_makeups` and `_unjustified_absence_count` now also require
  `status == "absent"`. Engine-level 2×2 (`test_pad381_engine_ignores_stale_justifications.py`),
  asserting the decision, not the helper's return: on the old code a student with two real
  unjustified absences plus one stale `present, unjustified` row was REFUSED by a "≤ 2" bar, and a
  student whose only row was a stale `present, justified` was ADMITTED to a "has make-ups" first
  wave; both controls (three real unjustified absences → refused; one real justified absence →
  admitted) passed before and after. 12/12 on sqlite and Postgres; 1098 passed, 2 skipped across the
  93 neighbouring engine/attendance test files.
  **Direction, in plain words:** students with a corrected "absent, unjustified" stop being
  penalised — coaches who set an unjustified-absence limit will invite some students they were
  wrongly skipping. Students with a corrected "absent, justified" stop being treated as owed a
  make-up — they leave the make-ups-first wave and are invited with everyone else, later, not
  never. Nobody with a real absence moves.
- **Third commit — the writers and readers ENUMERATED, not asserted** (grep over the backend, each
  one read). A third reader had no status check: `_students_with_justified_absences` →
  `get_notification_groups` → `GET /notify/groups` → the manual-invitation dialog on web and iOS,
  whose "Justified absences" group is enabled by default. A second writer could create the stale
  shape: `import_service.bulk_create_presences` wrote status and justification from the sheet with
  no coupling. Both fixed; 2×2 in the same test file — on the old code the stale row listed the
  student in that group and the import stored `('present', 'justified')`, the two controls passed
  before and after. The import test is SERVICE level (its route is the multi-sheet onboarding
  import). Safe writers, read one by one: the decline path writes absent + justified together;
  the PAD-313 re-take path, `notification_engine_api` and `lesson_service.enrol`'s reset only clear
  it; seed data sets it only when absent; the admin editor can write any column (admin-only).
- Found and NOT fixed here — PAD-382 (its ledger entry, B-143, arrives with that ticket's PR; no such file exists yet): `_students_with_justified_absences` and
  `_students_with_recent_absences` are not scoped to the coach, so one coach's manual-invitation
  dialog is shaped by another coach's attendance record.
- **The stale rows are NOT inert (Session-B's review, verified on the source):** the engine ignores
  them now, but both shells seed a row's local state from the STORED justification whatever the
  status and default an absent toggle to it, so flipping a stale `(present, justified)` student to
  absent sends `absent + justified` instead of the default `unjustified`. Rows heal when a class is
  re-saved. **Production count: ZERO such rows** (Session-A, read-only, 2026-09-21 20:58 UTC, on A's
  word: present 104 / absent 87, all 87 with a justification / NULL status 4288) — so the cleanup
  has nothing to touch today and the coordinator ruled none is owed: PAD-381 may close once #357
  is live on production and a re-count there is still 0. Originally: **PAD-381 is not finished until the cleanup
  (`UPDATE presences SET justification = NULL WHERE status = 'present' AND justification IS NOT NULL`)
  is done or a written decision says it is not needed** — it waits for Session-A's count and the
  owner's word for a production write (coordinator's ruling, 2026-09-21).
- NOT done here: the stale rows are not rewritten and not counted — for Session-A's queue:
  `SELECT justification, count(*) FROM presences WHERE status = 'present' AND justification IS NOT NULL GROUP BY justification`;
  un-marking attendance is an open product question.
- Session-C's pin `test_attendance_a_justification_cannot_be_cleared_and_a_mark_cannot_be_undone`
  (#354) asserts the old behaviour: its first three assertions flip, its control stays; flipped by
  this PR's author once #354 is on staging.
- Resolved: 2026-09-21 (PAD-381).
