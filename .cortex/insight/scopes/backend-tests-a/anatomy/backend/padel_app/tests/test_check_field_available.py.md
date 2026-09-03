---
path: backend/padel_app/tests/test_check_field_available.py
extracted_at: 2026-09-03T00:00:00Z
extraction_level: 2
size_lines: 215
size_tokens: 1892
centrality: medium
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "185bb4ba99f4db4e3ab857be42190ec9fca338b90942243a1b0c870af69449b3"
---

## Purpose

`/api/app/check_field_available` — PAD-7 (unique username/email, global,
exact match) and PAD-17 (warn-only, case-insensitive duplicate player
NAME check, scoped to the requesting coach's own roster). PAD-92 hardened
the endpoint: it is now `@jwt_required()` and the roster scope comes from
the caller's JWT rather than a client-supplied body field, closing an
anonymous-enumeration hole. Pins: a same-name duplicate on the requesting
coach's OWN roster returns 409 case-insensitively; the same name on a
DIFFERENT coach's roster does NOT warn (no cross-club false positive); a
genuinely new name is available; omitting `scope` in the body still
correctly checks the caller's own roster (derived from JWT); a body
`scope` naming a DIFFERENT coach's roster is rejected 403 (not silently
honored as an enumeration probe); an anonymous caller is rejected 401;
username/email checks remain exact-match and global regardless of the
name-scoping change; and a non-whitelisted (model, field) pair is
rejected 400.

## Connections

- Uses: models `User`, `Player`, `Coach`, `Association_CoachPlayer`;
  `flask_jwt_extended.create_access_token` for auth headers.
- Used by: (none — leaf test file)
- Semantically related (not imports): shares the "authorization scope
  must come from the JWT, never a client-supplied id" theme with
  `test_frontend_api_authz.py`'s
  `test_owner_check_field_available_uses_jwt_scope` and
  `test_body_coach_id_cannot_impersonate_another_coach`.
