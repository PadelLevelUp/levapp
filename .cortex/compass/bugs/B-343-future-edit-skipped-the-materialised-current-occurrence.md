---
id: B-343
title: "\"This and all future\" on a series occurrence that was already materialised skipped it: the student appeared from the next week on"
type: incomplete-rule
severity: medium
status: resolved
resolved: 2026-10-07T21:10:00Z
affects:
  - classes.edit
  - backend/padel_app/services/lesson_service.py
proposed_fix: "The Lesson-model future path walks the materialised occurrences from the boundary (as the LessonInstance path already did), the current one first."
opened: 2026-10-07T21:10:00Z
---

# B-343 — "this and future" skipped the materialised current occurrence (id unconfirmed, Session C range)

**Source:** PAD-515, reported by a coach via Discord: adding students with "esta e todas as aulas
futuras" applied from the next week on; the class being edited stayed without them.

**What the rule said:** `classes.edit` rule 9 (PAD-474): `future` "changes the series roster". It
did not say what happens to occurrences already materialised from the boundary on.

**Observed (read at staging `7db0e3f4a`, `lesson_service.edit_class_service`):** two paths by
`event.model`. `LessonInstance` + `future`: `_apply_future_edit_to_lesson` then
`_edit_future_instances_for_lesson(from_date)` — every materialised occurrence from the boundary
gets the payload, the current one included. `Lesson` + `future`: `_apply_future_edit_to_lesson`
only. Both shells keep `event.model = "Lesson"` for an occurrence of a series after it has been
materialised under them (B-046 named the seam for `single`, which is why `single` already checks
`_instances_on_date`). So the common case — the coach opened the class, which materialised it, and
then added a student "this and future" — changed the series roster and left the occurrence on
screen as it was; the next virtual occurrence showed the student because it was projected from
the series.

**Reproduced:** `test_pad515_future_edit_reaches_the_current_occurrence.py`: 4 red on the `Lesson`
path (`the current occurrence was skipped`), the `LessonInstance` control green. Green after the
fix; `test_pad474`, `test_pad513*`, `test_pad275*` unchanged.

**Root-cause class:** a rule that named the series and not the occurrences already cut from it.
Incomplete rule. Fix: rule 9's PAD-515 paragraph; the `Lesson` future path now walks the
materialised occurrences from the boundary, as the `LessonInstance` path does.
