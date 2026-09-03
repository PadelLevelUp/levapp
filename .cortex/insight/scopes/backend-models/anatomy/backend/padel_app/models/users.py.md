---
path: backend/padel_app/models/users.py
extracted_at: 2026-09-03T14:05:38Z
extraction_level: 2
size_lines: 165
size_tokens: 1607
centrality: medium
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "4a82df783ea80d24773e154279bee3266b283d291776c3085271142d7736caaa"
---

## Purpose

User is the actual identity/auth row (username/email/phone/password/is_admin/is_superadmin/status/language); Coach and Player are both 1:1 'role' extensions of a User. `role` picks 'coach' if `self.coach` else 'player' and carries a TODO 'RETHINK THIS FUNCTION' -- it does not handle a User with neither role (e.g. mid-registration) or, structurally, both. `abbreviation`/`abbreviation_display` (PAD-81): an explicit stored override, else initials derived from the first two words of `name` -- the fallback logic serializers/user.py used to hardcode before this column existed. `notif_block_auto_invitations`/`notif_block_manual_invitations`/`notif_block_all` (PAD-112) are three INDEPENDENT granular notification-block switches -- an in-code comment stresses `notif_block_all` is a superset only in EFFECT, not a toggle that flips the other two -- plus `notif_block_reason`, free text visible to the player's coach (the opposite privacy posture from a CalendarBlock's title/description, which the coach must never see, PAD-107).

## Connections

Uses:
- backend/padel_app/model.py: the `Model` mixin -- created_at/updated_at columns, generic CRUD (create/save/delete), and the admin-editor form/display plumbing (get_create_form, display_all_info)
- backend/padel_app/sql_db.py: the shared `db` SQLAlchemy instance this table is declared against

Used by:
- backend/padel_app/models/__init__.py: imports (and re-exports) this class so it is reachable via `padel_app.models`

Semantically related (not imports):
- backend/padel_app/models/players.py: player relationship back_populates user, uselist=False (1:1)
- backend/padel_app/models/coaches.py: coach relationship back_populates user, uselist=False (1:1)
- backend/padel_app/models/calendar_blocks.py: calendar_blocks back_populates user
- backend/padel_app/models/messages.py: messages_sent back_populates sender, cascade delete-orphan
- backend/padel_app/models/blocked_user.py: blocker/blocked FKs target this table
- backend/padel_app/serializers/user.py: serialize_user reads name/username/email/status/language/abbreviation_display/user_image_url directly
