---
id: B-052
title: "Editor registry traps: Message under the key \"lessage\" (404), DeviceToken and LessonInstanceTraining schema 500s"
type: missing-criterion
severity: low
status: resolved
affects:
  - backend/padel_app/models/__init__.py
  - backend/padel_app/models/device_token.py
  - backend/padel_app/models/lesson_instance_training.py
  - backend/padel_app/modules/editor_api.py
proposed_fix: "Keys are the lowercased class name; unregister the mixin-less association table; valid field types on DeviceToken; a test that walks the whole registry through the editor's own calls."
opened: 2026-09-10T11:50:00Z
resolved: 2026-09-10T12:10:00Z
---

# B-052 — Editor registry traps

**Source:** data-model audit 2026-09-02, §13 (ticket PAD-280). Reproduced on `origin/staging`
58e7ab0 on 2026-09-10, as a superadmin, through `/api/editor/*`.

**What happened:**
1. `GET /api/editor/message` and `/api/editor/message/schema` returned 404. `MODELS` registered
   Message under the key `"lessage"`.
2. `GET /api/editor/devicetoken/schema` returned 500 (`ValueError: type is not valid`). The form
   declared field type `"String"`, which the form layer does not accept (it accepts `"Text"`). This
   was not in the audit; the registry walk found it.
3. `GET /api/editor/lesson_instance_training/schema` and the list route returned 500
   (`AttributeError: ... no attribute 'get_create_form'`). The model is a plain association table
   with no editor mixin and no `id` column, registered anyway.
4. MessageReaction, MessageReport and BlockedUser had no `page_title` / `model_name`, so the editor
   showed the raw key and the legacy editor's `url_for(model=self.model_name)` had no name to use.

**What should happen:** every registered model is reachable under `cls.__name__.lower()` (the key
the legacy editor and `api.py` already derive from `model_name`), and the editor's schema and list
routes answer 200 for all of them.

**Root cause:** type 1, missing criterion. The registry had no stated rule and no test. `MODELS`
is a hand-typed dict, and nothing checked it against the calls the editor makes. The same class of
trap had already been fixed once by hand for TokenBlocklist (see the comment in `models/__init__.py`).

**Evidence:** a superadmin walk over all 47 registered models on staging returned 404 for
`message`, schema 500 for `devicetoken` and `lesson_instance_training`, list 500 for
`lesson_instance_training`, and missing attributes for three models.

### Change plan
- Rule: registry keys are `cls.__name__.lower()`, and every model has `page_title` and a
  `model_name` whose lowercase is its key. Pinned by `test_pad280_model_registry.py`.
- Rename `lessage` to `message` and `conversation_participant` to `conversationparticipant`. No caller
  hard-codes either key; the web editor reads keys from `/api/editor/models`.
- Unregister LessonInstanceTraining, as TokenBlocklist is. Adding the mixin would add columns and
  need a migration.
- DeviceToken uses the `"Text"` type and passes `related_model="User"`.
- The test walks every registered model through `get_create_form()`, every field's
  `get_field_dict()`, `display_all_info()` and the `id` the list route orders by.

### Resolution
- Code: `models/__init__.py`, `device_token.py`, `message_reaction.py`, `message_report.py`,
  `blocked_user.py` and `conversation_participants.py` (title typo). Also in PAD-280 but not part
  of this bug: `presences.py` (`__table_args__` assigned once) and four migration docstrings.
- Tests: `backend/padel_app/tests/test_pad280_model_registry.py`, watched red on staging (9
  failures, each for its own reason), then green.
- Resolved in PAD-280.
