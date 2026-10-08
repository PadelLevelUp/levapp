---
id: B-346
title: "A class ending at midnight was stored ending at 00:00 of its own day, before it started"
type: incomplete-rule
severity: high
status: resolved
resolved: 2026-10-08T00:40:00Z
affects:
  - classes.create
  - backend/padel_app/tools/calendar_tools.py
  - backend/padel_app/services/lesson_service.py
  - backend/padel_app/services/import_service.py
proposed_fix: "An end of exactly 00:00 after a later start is the next day's 00:00 (build_end_datetime) on create, materialisation, edit and import; a repair migration moves the stored rows."
opened: 2026-10-08T00:10:00Z
---

# B-346 — a midnight end was stored before the start (id unconfirmed, Session C range; PAD-553)

**Source:** found by Session C at 00:03 WEST on 2026-10-08, when `test_pad515` went red after 23:00.
The PAD-474 fixture starts a series at "the next hour, tomorrow"; after 23:00 that is a 23:00–24:00
class.

**Probe:** the materialised occurrence read `start 2026-10-08 23:00`, `end 2026-10-08 00:00`,
club now `00:03`: already "over".

**Cause:** `build_datetime(date, end_time)` builds the end on the class's own date. An end of
`00:00` landed at the start of that day. Callers: `transform_to_datetime` (materialisation and
instance edits), `add_class_service` (create) and the class import.

**Readers that misfired from 00:00 that day:** the PAD-515 series walk (skipped it as ended),
`list_pending_validation` (listed it as already run), `count_pending_validation_total` (counted it
as waiting).

**Root-cause class:** `classes.create` said nothing about an end at midnight. Incomplete rule.
Fix: rule 8c. Only an end of exactly 00:00 after a later start moves; any other backwards end is
B-294's (open), so a typo never becomes a 23-hour class.

**Repair:** migration `bee8d57daf79` moves rows in `lessons` and `lesson_instances` whose end is
before their start and at 00:00. Walked on Postgres: up, down (no-op) and up again.
