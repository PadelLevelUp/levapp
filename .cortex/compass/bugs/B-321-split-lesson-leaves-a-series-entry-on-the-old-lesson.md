---
id: B-321
title: "split_lesson leaves a series-scoped standing entry on the old lesson: the moved occurrences keep its rows, later occurrences of the new lesson get none"
type: incomplete-rule
severity: low
status: open
affects:
  - notifications.waiting-list
  - backend/padel_app/services/lesson_service.py
proposed_fix: "When split_lesson moves the occurrences from a date onward to a new lesson, carry the series-scoped standing entries along: a scoped entry of the old lesson gains a twin scoped to the new lesson (or is re-pointed when the old lesson keeps no future occurrence), so occurrences the new lesson materialises later are still fanned out."
opened: 2026-10-08T06:24:50Z
---

# B-321: split_lesson leaves a series entry on the old lesson

**Source:** PAD-547 review (#588, coordinator 0710-orchestrator, 2026-10-08). Numbering in
0710-SessionB's range, unconfirmed.

**What the spec says:** `notifications.waiting-list` rule 19: a standing entry scoped to a series
fans out to that series' upcoming occurrences, "existing and later materialised".

**What happens:** `lesson_service.split_lesson` copies the series into a new `Lesson` from a
date onward and moves those occurrences to it. A standing entry scoped to the old lesson
(`standing_waiting_list_entries.lesson_id`) is not touched. Its rows on the moved occurrences stay
active, but occurrences of the new lesson materialised later are not fanned out, because the entry
is scoped to the old lesson id.

**Why it is latent:** `split_lesson` has no production caller today. Only tests call it
(`test_recurring_delete_exclusion.py`, `test_pad275_series_and_overrides.py`). It becomes live
the day a "this and future" edit splits a series with it.
