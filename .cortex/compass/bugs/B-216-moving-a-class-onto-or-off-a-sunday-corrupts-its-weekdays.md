---
id: B-216
title: "Moving a recurring class onto or off a Sunday corrupted its daysOfWeek (ISO 7 vs calendar 0)"
type: incomplete-rule
severity: high
status: resolved
affects:
  - classes.edit
  - backend/padel_app/services/lesson_service.py
proposed_fix: "update_recurrence_weekday computes weekdays in the calendar convention, (weekday() + 1) % 7."
opened: 2026-09-26T09:58:01Z
resolved: 2026-09-26T09:58:01Z
---

# B-216: moving a class onto or off a Sunday corrupted its weekdays (PAD-464)

**Source:** Session-B, found while planning PAD-463 (a code read). Reproduced with a backend test before any fix.

**What happens:** `edit_lesson_helper` → `update_recurrence_weekday` rewrote `daysOfWeek` with ISO weekdays (`weekday() + 1`, Sunday = 7). The calendar's convention is 0 = Sunday … 6 = Saturday (`WEEKDAY_MAP`).
- **Onto a Sunday:** Mon+Wed with the Monday moved to Sunday became `[3, 7]`. `WEEKDAY_MAP` drops 7, so the series recurs on Wednesdays only.
- **Off a Sunday:** `[0]` with the Sunday moved to Tuesday became `[0, 2]`, so the Sundays stayed.

**Root cause (observed):** `test_b216_recurrence_weekday_sunday.py` was red with exactly `[3, 7]` and `[0, 2]`; the Tuesday control was green. Type: `classes.edit` had no rule stating the convention for this write (incomplete rule). Rule 8 now states it.

### Change plan and resolution
- `lesson_service.update_recurrence_weekday`: `(weekday() + 1) % 7`.
- `classes.edit` rule 8 and a criterion.
- Tests: the new file, 3 cells (red, red, green before the fix; green after), plus `test_reminder_jobs_on_future_edit.py` green.
- **Stored data (not touched; any backfill is the coordinator's decision):**
  - A `daysOfWeek` containing **7** is certainly a moved-onto-Sunday row, and it is repairable without ambiguity (7 → 0).
  - A leftover **0** from a move off a Sunday can't be told apart from a genuine Sunday class using the row alone.
- Resolved: 2026-09-26T09:58:01Z

### Data repair (2026-10-01)
A read-only prod count on 2026-09-30 found **1 of 45** JSON recurrence rules still holding a 7: lesson 57, `daysOfWeek` `[0, 6, 7]`. Its recurrence end (2026-08-28) falls before its start (2026-08-30), so it has no instances and nothing was visible. Migration `b3a1c474d07b` turns 7 into 0, then de-duplicates and sorts, so that rule becomes `[0, 6]`. It writes only JSON rules that hold a 7, so a second run is a no-op. Downgrade is a no-op. Test: `test_b216_stray_sunday_7_migration.py`.
