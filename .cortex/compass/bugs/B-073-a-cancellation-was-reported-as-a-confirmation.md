---
id: B-073
title: "A student's cancellation was reported back as a confirmation, because `confirmed` means answered, not coming"
type: wrong-rule
severity: high
status: resolved
affects:
  - attendance.presence
  - backend/padel_app/services/presence_overview_service.py
  - backend/padel_app/serializers/presence.py
related_specs:
  - .specflow/specs/attendance/presence.spec.md
proposed_fix: "One derived `attendanceState` computed in a single place on the model, with the absent check before the confirmed check, served by the class detail and the Presences rows alike."
opened: 2026-09-12T00:00:00Z
resolved: 2026-09-12T00:00:00Z
---

# B-073 — A cancellation read as a confirmation

**Source:** founder feedback on TestFlight 20 (staging b0c966f27), filed as PAD-313.

## What happened

After a student cancelled, the app showed **"presença confirmada"**, **"falta justificada"** and
**"ausente"** at the same time. Two of those were faithful. The third was not.

The decline path writes `confirmed = True` — in this model that flag means *the student answered*,
not *the student is coming* (`attendance.presence` rule 2). `_response_state`, the one derived
status the backend served, tested `confirmed` first, so a student who had just cancelled came back
as `"confirmed"`: indistinguishable from one who had accepted. Its `"declined"` branch was
effectively unreachable for a student decline, because every decline sets `confirmed` on its way
through.

Verified rather than reasoned, on the three real row shapes: a cancellation returned `"confirmed"`,
an acceptance returned `"confirmed"`, a coach-marked absence returned `"none"`.

## Why it was missed

The class-detail payload had **no** derived status at all — it shipped six raw columns and let each
client decide. Three independent badges each reading one column is not a UI mistake so much as the
absence of a server-side answer: nothing told the clients what the row *meant*, so they rendered
what it *held*. The one place that did derive a status had the bug, and its own docstring described
a guard for the opposite confusion (a coach's mark being attributed to the student) while missing
this one.

## Fix

`Presence.attendance_state` (`attendanceState` on the wire), computed in one place and served by
both the class detail and the Presences rows: `planned | coming | not_coming | attended | missed`,
exactly one true. While `validated` is false it reports the student's intent; once true, the
coach's record. **The absent check comes before the confirmed check** — that ordering is the whole
fix. `_response_state` gets the same correction.

The state is deliberately author-blind: it says what is true of the spot, never who said it.
Provenance is a separate fact (`cancelledByStudent`) until PAD-271's `recorded_by` makes it a
stored one.

## Lesson

A column whose name promises more than it knows will eventually be read at face value. `confirmed`
had meant "answered" since it was written, and every reader that took it for "coming" was wrong in
a way no test caught, because the tests asserted on the same columns the code did. The durable fix
is not a better predicate but a single derived answer that no client may bypass — and, behind it,
PAD-271's `response`, which removes the ambiguity at the root.
