---
path: backend/padel_app/tests/test_pad93_boolean_blast_radius.py
extracted_at: 2026-09-03T13:59:54Z
extraction_level: 2
size_lines: 495
size_tokens: 4849
centrality: medium
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "5330c630acc0090bf9dfa64520c2d77410eb9010476e831b9393e5359a6aa3b6"
---

## Purpose

PAD-93 tests for the collateral damage of the PAD-69 fix to `Field.set_boolean_value` (which used to coerce `True == "true"` as `False`, so every JSON boolean was persisted as `False`). Now that real booleans survive the generic form layer, four separate write paths needed re-auditing: (1) `TestUserPrivilegeFlagsAreNotFormSettable` pins that `is_admin`/`is_superadmin` can never be granted (or revoked) through `user_service.create_user_service`/`edit_user_service`/`activate_user_service`, since `POST /api/app/user` is unauthenticated and a real `{"is_admin": true}` would now actually work; (2) `TestConversationIsGroup` pins `messaging_service.create_conversation_service` correctly derives `is_group` (a 1-on-1 DM is never flagged as a group, since the source expression previously miscounted the creator); (3) `TestBlockerFlagSurvivesEventEdit` pins `calendar_service.edit_event_service` no longer silently clears `calendar_blocks.blocks_auto_invitations` on an edit payload that never carries the field (PAD-28); (4) `TestFormFieldDeclarations` audits the generic Field/Form declaration layer itself — two `conversation_participants` datetime columns mislabelled `"Boolean"`, a phantom `validated` field on `Conversation` with no backing column, and a codebase-wide sweep (`test_every_boolean_form_field_has_a_boolean_column`) asserting every model's `Boolean`-typed form field actually points at a `sqlalchemy.Boolean` column. `TestBackfillRules` and `TestRecurringClassNowPersistsTheFlag` cover the historical data-repair side: migration `a7b8c9d0e1f2`'s `UPDATE` backfills for `lessons.is_recurring` and `presences.validated` (scoped precisely, idempotent) plus the end-to-end write path (`lesson_service.add_class_service`) that was the actual corruption source.

## Connections

- Uses: `padel_app.services.user_service` (`create_user_service`, `edit_user_service`, `activate_user_service`), `padel_app.services.messaging_service.create_conversation_service`, `padel_app.services.calendar_service.edit_event_service`, `padel_app.services.lesson_service.add_class_service`, `padel_app.models.User`, `padel_app.models.coaches.Coach`, `padel_app.models.CalendarBlock`, `padel_app.models.conversation_participants.ConversationParticipant`, `padel_app.models.conversations.Conversation`, `padel_app.models.clubs.Club`, `padel_app.models.lessons.Lesson`, `padel_app.models.lesson_instances.LessonInstance`, `padel_app.models.players.Player`, `padel_app.models.presences.Presence`, `padel_app.model.Model` and `db.Model.registry.mappers` (introspects every model's `get_create_form()`), `padel_app.sql_db.db`, `sqlalchemy.Boolean`, `sqlalchemy.text` (raw backfill SQL); the `app` fixture from `conftest.py` (scope `backend-tests-a`).
- Used by: —
- Semantically related (not imports): none identified.
