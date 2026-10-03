---
id: B-268
title: "The general user list answered every active user to any signed-in caller"
type: wrong-rule
severity: high
status: triaged
affects:
  - backend/padel_app/modules/frontend_api.py
  - .specflow/specs/messaging/direct-by-username.spec.md
proposed_fix: "Answer GET /api/app/users with exactly the caller's messageable set (the picker's set), same public shape; delete the dead client definitions."
opened: 2026-10-02T18:03:34Z
---

# B-268: an endpoint listed more than its caller should see

**Source:** the independent review of PR #514 (PAD-483), 2026-10-02; filed as PAD-500.

**Class of problem:** an endpoint that lists more than its caller should see. The general user
list required only a signed-in caller and answered every active user, with username and role.
That exposed who uses the app to every account, and it made the messaging picker's scoping
(B-267) cosmetic for a determined client.

**Evidence (Phase 1):** `backend/padel_app/tests/test_pad500_user_list_scope.py` against the
PAD-483 head 220beca5b: 2 failed, 1 passed — a student's list held every user, the student
themself and an unlinked coach included (`{1, 2, 3, 4, 5, 6} == {2, 3, 4, 5}`).

**Root cause:** the route predates the messaging scope and was never brought under it; direct-by-
username rule 7 asserted no such endpoint existed, so nothing tested it. Type 3 (the rule was wrong
about the system).

**Callers:** none. Every client definition (packages/api `getUsers`, web `getUsers`, mobile
`useUsers`) was defined and never called, on staging and in installed iOS builds 1.0–1.2.1. The
route stays so an unknown old caller gets a shorter list, never an error.

### Change Plan
- `GET /api/app/users` returns `get_messageable_users_service(current_user())` in
  `serialize_user_public` shape.
- Delete the three dead client definitions.
- Correct direct-by-username rule 7 and `apps/mobile/API-CONTRACT.md`.

### Resolution

(filled in when the PR lands)
