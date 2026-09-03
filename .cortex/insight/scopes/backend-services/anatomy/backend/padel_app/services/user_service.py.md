---
path: backend/padel_app/services/user_service.py
extracted_at: 2026-09-03T13:58:46Z
extraction_level: 2
size_lines: 190
size_tokens: 1688
centrality: medium
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "e81da0fe87010fa028aaa7a9f7de8600bc4ea6bed8236274534264ec773a180e"
---

## Purpose

Generic `User` CRUD (`create_user_service`, `edit_user_service`,
`activate_user_service`), all of which strip privilege fields
(`is_admin`, `is_superadmin`) from form-derived values before writing —
and `update_own_profile_service` (PAD-81), a partial self-service
profile updater for `PATCH /api/auth/me` with field-level validation
(name required non-empty, email format + uniqueness, abbreviation
length, supported-language check) and the PAD-112 notification-block
toggle writes.

## Connections

- Uses: `padel_app.models.User`; `padel_app.sql_db.db`;
  `padel_app.tools.request_adapter.JsonRequestAdapter`.
- Used by: user-management and self-profile routes (outside this scope,
  in the API layer).

## Insights

- `PRIVILEGE_FIELDS` stripping exists specifically because these
  services sit behind UNAUTHENTICATED routes
  (`POST /api/app/user`, `POST /api/app/user/<id>`,
  `POST /api/app/activate/user/<id>`, per the inline comment): before
  the PAD-69 boolean-coercion fix, a payload like `{"is_admin": true}`
  was harmlessly coerced to `False` by the (buggy) form layer; once real
  booleans started surviving form validation, the SAME payload would
  actually grant admin without this explicit strip. The authenticated,
  admin-only generic editor (`modules/editor.py`/`modules/api.py`,
  outside this scope) is the only path where admin flags remain
  settable.
- `update_own_profile_service` only touches keys PRESENT in the payload
  (`if "name" in data`, not `if data.get("name")`) — explicitly so a
  boolean `False` for a notification-block toggle is honored rather than
  treated as "not sent". Its docstring notes this replaces an earlier
  version of `PATCH /api/auth/me` that silently ignored every field
  except `language`.
- `_coerce_bool` rejects anything that isn't a real bool, `0`/`1`, or the
  literal strings `"true"`/`"false"` — it deliberately does NOT fall
  back to Python truthiness (`bool(value)`), so a malformed client value
  raises `ProfileValidationError` instead of being silently
  misinterpreted as "block everything" or "block nothing".
