---
id: B-529
title: "A student could not open an advertised open spot (or a PAD-664 full class) on an occurrence that was never materialised: the class read answered 403 and the sheet stayed shut"
type: incomplete-rule
severity: high
status: resolved
resolved: 2026-10-14T19:00:00Z
affects:
  - .specflow/specs/classes/join-requests.spec.md
  - backend/padel_app/modules/frontend_api.py
  - backend/padel_app/services/class_join_request_service.py
proposed_fix: "join-requests rule 16's read exception is asked of the one occurrence when the read is a series read with a date (Lesson + date): the series produces the date, it has not started, the lesson is active, visible, has room (or the client declares full-classes) and the student is eligible; nothing is materialised."
opened: 2026-10-14T18:55:00Z
---

# B-529: a never-materialised open spot could not be opened

**Source:** PAD-664 (la-1410-SessionB), found by the PAD-664 E2E; id from B's wave-15 range.

**What happens:** the student calendar advertises open spots on occurrences that have no
`LessonInstance` row yet (every future recurring occurrence, and a one-off class nobody
materialised) — `eligibility.open-spot-visibility` rule 4 requires it. Opening one sends
`POST /api/app/class_instance?model=Lesson&id=<lesson>&date=<day>`. `require_readable_class`
applied `classes.join-requests` rule 16's exception only to a materialised instance
(`not is_lesson`), so the read answered 403, the sheet's `classInstance` stayed empty and the web
sheet rendered nothing (`if (!active) return null`). The "Pedir para entrar" (PAD-131) and
"Juntar-me à lista de espera" (PAD-664) actions were therefore unreachable on those classes. The
spec itself said "A never-materialized occurrence is not covered", while the calendar advertised
exactly those.

**What should happen:** an occurrence the calendar advertises to a student opens for them, on the
same conditions whether or not it has a row.

**Evidence (Phase 1):** red-first on feature/pad-664 (6434b5536 + working tree),
`test_pad664_full_classes.py::test_a_never_materialised_open_spot_opens_for_a_declaring_student`
— the calendar listed the class with `studentRelation` `open_spot`, then the read answered
`403 {"error":"Not authorized to view this class"}`; the E2E trace showed the same 403 on
`class_instance?model=Lesson&id=12&date=2026-10-16`.

**Fix:** `student_may_view_open_occurrence(player, lesson, occ_date, allow_full=)` in
`class_join_request_service`, called by `require_readable_class` for a series read with a date.
It reads the lesson's own coach rows (not `primary_coach`, which reads an id as an instance id).
Green: the three B-529 tests in `test_pad664_full_classes.py` (open spot opens; full only with
`full-classes`; ineligible student still refused; no row materialised).
