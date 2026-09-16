---
id: B-071
title: "Per-occurrence enrolment lived in three tables written on different paths; capacity under-counted when they disagreed"
type: incomplete-rule
severity: high
status: resolved
affects:
  - classes.instance-enrollment
  - classes.enrollment
  - calendar.view
  - attendance.presence
  - backend/padel_app/models/lesson_instances.py
  - backend/padel_app/models/presences.py
  - backend/padel_app/services/lesson_service.py
  - backend/padel_app/services/notification_service.py
related_specs:
  - .specflow/specs/classes/instance-enrollment.spec.md
  - .specflow/specs/calendar/view.spec.md
proposed_fix: "The presence row is the enrolment (owner decision 2026-09-11, option A). One writer, enrol()/unenrol(), replaces every raw junction and presence construction; capacity and every 'is enrolled' read move to presences; a guarded single-statement backfill creates the missing presences and the junction stays one release as a shadow checked by reconcile_enrolment()."
opened: 2026-09-11T00:00:00Z
resolved: 2026-09-11T00:00:00Z
---

# B-071 — Three enrolment stores, written on different paths, and capacity counted across two of them

**Source:** 2026-09-02 data-model audit, finding H5 (verified), filed as PAD-259. Ledger number
from Session H's reserved range (B-071..B-073).

**What happened:** "who is in this class on this date" lived in `player_in_lesson` (the series
roster), `player_in_lesson_instance` (the occurrence) and `presences` (the occurrence again).
Capacity was junction rows minus absent presences (`LessonInstance.effective_filled_spots`,
PAD-71), so the number was right only when every junction row had a presence and every presence
a junction row. They were written on different paths: materialisation and the engine's fills
wrote both; the coach's one-off instance and add-to-instance wrote the junction only; the import
and a reminder answer from a non-enrolled player wrote a presence only; three sites created a
presence lazily "if missing". Dev database at audit time: 14 of 41 presences had no junction row
and two instances carried an absent presence for a non-enrolled player, under-counting capacity
by one each. The staging copy of prod on 2026-09-11 (Session E, read-only): 2 junction rows
without a presence, 0 presences without a junction row, 0 orphan references.

**Root cause:** Type 2 — incomplete rule. `classes.instance-enrollment` said the junction "links
players to specific instances" and that such players "get a Presence record", but never said
which row IS the enrolment, so every path chose for itself and nothing reconciled them. The
spec's own promise (`classes.instances` rule 2, `attendance.presence` rule 1: presences exist
from materialisation) was what the model failed to keep.

**Owner decision (2026-09-11, in person):** option A. One `Presence` row per student per
occurrence is the enrolment, carrying three separate facts as three separate fields — planned
(the row exists), intends to come (the student's answer), was there (the coach's record). Two
phases: this ticket keeps the junction as a shadow written by the single writer and checked
against presences; a later batch drops it.

### Change plan

1. Spec: `classes.instance-enrollment` rewritten (rules 1–9), `classes.enrollment`,
   `classes.instances` rule 2, `attendance.presence` rule 6, `attendance.confirm` rule 14,
   `calendar.view` rules 8 and 10 — committed before code (827d25f3e).
2. `presences.enrolment_source` (CHECK-constrained string) and `enrol()` / `unenrol()` /
   `reconcile_enrolment()` in `lesson_service`.
3. Every writer routed through `enrol()`: materialisation, instance create and edit, the
   attendance-sheet walk-in, the import, the engine's `_add_player_to_instance`.
4. Every reader moved to presences: `effective_filled_spots`, `players`, the participants list,
   the calendars, the engine's "is enrolled" checks.
5. Migration `fed5ed4916a8`: column, check, one-statement backfill tolerant of gone rows (B-059),
   four logged counts, upgrade fails if a non-orphan junction row is left without a presence.

### Resolution

- **Code (this ticket, PAD-259):** `models/presences.py` (column, `ENROLMENT_SOURCES`, check),
  `models/lesson_instances.py` (`players`, `enrolled_player_ids`, `effective_filled_spots` on
  presences), `services/lesson_service.py` (`enrol`, `unenrol`, `reconcile_enrolment`; every
  writer), `services/import_service.py`, the readers in the engine, helpers, serializers and
  modules, `migrations/versions/fed5ed4916a8_pad259_presence_is_enrolment.py`.
- **Tests:** `test_pad259_enrolment.py` (5: materialisation, coach add, walk-in, removal retires
  the reminder bubble, shadow agrees) — 4 red on the old writers, all green after;
  `test_pad259_migration.py` (3: backfill with an orphan on a scratch SQLite, sabotage makes the
  upgrade fail, downgrade round-trip).
- **Postgres dry run** (scratch database built by the real chain up to `390bf6e8be12`, seeded
  with two junction rows without a presence and one presence without a junction row):
  `junction_without_presence_before=2 presences_inserted=2 junction_without_presence_after=0
  capacity_changes=1`, check constraint present, downgrade keeps all rows, re-upgrade inserts
  nothing. The same shape prod is expected to log (Session E's counts).
- **Deferred (phase 2):** drop `player_in_lesson_instance`, remove the shadow writes and the
  table from the player-claim and account-deletion lists.
- **Resolved:** 2026-09-11 (PAD-259).
