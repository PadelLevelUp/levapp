---
path: backend/padel_app/services/calendar_service.py
extracted_at: 2026-09-03T13:58:46Z
extraction_level: 2
size_lines: 211
size_tokens: 2065
centrality: medium
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "7c0bfea3786a8887acab703fac9a4fe226ec8444ba1df49b5c9e1de8c80c234d"
---

## Purpose

CRUD and scope-aware mutation logic for `CalendarBlock` (personal
calendar events/blockers, distinct from `Lesson`/`LessonInstance`
classes). Covers admin form-based creation/editing, app-facing
add/edit/remove-event services, and drag-and-drop reschedule. The core
complexity is splitting/cloning a recurring series when a single
occurrence is edited, moved, or deleted independently of the rest of the
series (`_split_block`, `_clone_block`, `_next_occurrence_after`):
deleting or moving one occurrence of a recurring block truncates the
original series and spins off a new cloned series resuming after the
affected date, rather than mutating the recurrence rule in place.

## Connections

- Uses: `padel_app.models.CalendarBlock`; `padel_app.tools.request_adapter.JsonRequestAdapter`
  (adapts a plain dict into the form-validation pipeline `CalendarBlock`
  forms expect); `padel_app.tools.calendar_tools.expand_occurrences`
  (recurrence-rule occurrence expansion).
- Used by: `services/student_availability_service.py` (`add_event_service`,
  `edit_event_service`, `remove_block_service` — student availability
  blockers are `CalendarBlock` rows with `type="unavailable"`, reusing
  this CRUD rather than a dedicated table).

## Insights

- PAD-93/PAD-28 gotcha, called out explicitly in `edit_event_service`:
  the form layer writes every Boolean field on every submit, so a
  payload that never mentions `blocks_auto_invitations` (as
  `_build_payload` never does) would silently CLEAR that flag on every
  edit. The fix is popping the key from `values` before
  `update_with_dict` — a caller adding new boolean fields to
  `_build_payload` must re-audit this guard, and `add_presences` in
  `lesson_service.py` has the analogous guard for reminder flags
  (PAD-69).
- Split-on-delete semantics: `_split_block` treats "delete/move the
  FIRST occurrence" as advancing `start_datetime` in place, but any
  later occurrence as truncating the original series
  (`recurrence_end = occ_date - 1 day`) and cloning a fresh series that
  resumes after it — so a recurring block's identity (its row id) can
  fork into two rows across a single-occurrence edit.
