---
path: backend/padel_app/tests/test_delete_nonnumeric_id_guard.py
extracted_at: 2026-09-03T00:00:00Z
extraction_level: 2
size_lines: 104
size_tokens: 1029
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "9f5d5b6b400efe84f7096f2a0d8a2a843891a69c14b59ed9025b47f1c21b06e5"
---

## Purpose

PAD-101 — the generic delete endpoints (`/api/app/delete/<model>`) must
reject a non-numeric id with a clean 400 instead of a bare `int(...)`
raising and bubbling up as a 500. Context: a freshly-added, not-yet-
persisted row (coach-levels / strengths-weaknesses editors) carries a
temporary string id like `"new-<Date.now()>"`; deleting it before a
refetch re-keys it with a real numeric id posts that string to the delete
endpoint. Note (batch history): PAD-92 landed alongside this and added
`@jwt_required()` plus routed the id through a shared `_required_int_id`
helper that subsumes PAD-101's original inline guard — the CONTRACT (bad
id -> 400, never 500) is unchanged but is now only observable by an
authenticated caller; anonymous requests are rejected 401 before the id
is ever parsed, so every test here authenticates first. Pins: a
`"new-..."` id on `coach_level` and `coach_note` both 400 (asserting the
response text mentions "integer"/"numeric", since PAD-92's `abort(400,
...)` renders an HTML error page rather than PAD-101's original JSON
envelope); a missing id (`{}`) is 400; a well-formed numeric id with no
matching row is 404 (not 400, not 500); and an anonymous caller never
reaches the id guard at all (401).

## Connections

- Uses: `flask_jwt_extended.create_access_token`; models `User`,
  `padel_app.models.coaches.Coach`.
- Used by: (none — leaf test file)
- Semantically related (not imports): shares the "never 500, fail with
  the correct status code" discipline with `test_backend_500_fixes.py`;
  the PAD-92 auth-guard-before-parsing pattern recurs in
  `test_check_field_available.py` and `test_frontend_api_authz.py`.
