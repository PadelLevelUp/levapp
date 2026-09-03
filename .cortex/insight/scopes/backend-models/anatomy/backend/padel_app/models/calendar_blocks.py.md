---
path: backend/padel_app/models/calendar_blocks.py
extracted_at: 2026-09-03T14:05:38Z
extraction_level: 2
size_lines: 70
size_tokens: 720
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "eaf0fddb8a5313439b0e943a0da80b4e15fbee1242f0b9fc11463b10c2fd6c65"
---

## Purpose

CalendarBlock is a User's own unavailability window (break/holiday/off_work/personal/unavailable), optionally recurring (recurrence_rule stored as raw JSON text, parsed defensively by the calendar serializer). `blocks_auto_invitations` lets a block additionally suppress the automatic-invitation engine for that user during its window (manual coach additions are unaffected) -- consumed by an out-of-scope 'smart notification eligibility engine'. The same table backs both a coach's own schedule blocks and a student's personal blocks, since it FKs to `users.id` rather than `coaches.id`.

## Connections

Uses:
- backend/padel_app/model.py: the `Model` mixin -- created_at/updated_at columns, generic CRUD (create/save/delete), and the admin-editor form/display plumbing (get_create_form, display_all_info)
- backend/padel_app/sql_db.py: the shared `db` SQLAlchemy instance this table is declared against

Used by:
- backend/padel_app/models/__init__.py: imports (and re-exports) this class so it is reachable via `padel_app.models`

Semantically related (not imports):
- backend/padel_app/models/users.py: User.calendar_blocks back_populates this class
- backend/padel_app/serializers/calendar.py: serialize_calendar_block reads its fields directly (duck-typed, no import)
