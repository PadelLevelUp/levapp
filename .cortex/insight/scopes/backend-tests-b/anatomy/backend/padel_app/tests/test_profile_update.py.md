---
path: backend/padel_app/tests/test_profile_update.py
extracted_at: 2026-09-03T13:59:54Z
extraction_level: 2
size_lines: 251
size_tokens: 1833
centrality: medium
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "9c1a834015c56238aa20a3f83e8ddf15d220d5574aaed91b4c146798c77cafed"
---

## Purpose

PAD-81 tests for `PATCH /api/auth/me` self-service profile editing. Before the fix the route accepted only `language`; every other Settings field (name, abbreviation, email, phone) was silently dropped, so the UI could report a successful save that never persisted. Pins: `GET /api/auth/me` exposes name/email/phone plus a derived `abbreviation` (first two words' initials when none is stored); `PATCH` persists all profile fields at once, normalizing email (trim + lowercase) and abbreviation (uppercase, truncated to 4 chars); a partial payload updates only the given fields, leaving the rest untouched; `language` still validates against a supported-locale allowlist (400 on `"fr"`); blank name and invalid email are rejected with 400 and no write; a duplicate email 409s (but re-saving your OWN unchanged email succeeds); empty-string values clear optional fields to `None` (abbreviation falls back to derived initials); and fields outside the allowlist (`is_superadmin`, `username`) are silently ignored rather than erroring or applying — a privilege-escalation guard on the same route.

## Connections

- Uses: `padel_app.models.User`, `padel_app.sql_db.db`; `flask_jwt_extended.create_access_token` for auth headers; the `app` and `client` fixtures from `conftest.py` (scope `backend-tests-a`). Exercises the `auth`/`api_auth` blueprint's `/api/auth/me` route (scope `backend-api`) via `client.get`/`client.patch`.
- Used by: —
- Semantically related (not imports): `test_pad93_boolean_blast_radius.py::TestUserPrivilegeFlagsAreNotFormSettable` (same privilege-escalation concern — a JSON payload must never grant admin — applied to a different route/service).
