---
path: frontend/apps/web/e2e/security/frontend-api-auth.spec.ts
extracted_at: 2026-09-03T14:18:15Z
extraction_level: 2
size_lines: 316
size_tokens: 2775
centrality: medium
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "123b8e46c260f4c42c70034ba8e664aa1ebdbd8a444f20e938f6422e5d9f1a47"
---

## Purpose

PAD-92 regression test pinning the HTTP-level auth contract of
`/api/app` (`modules/frontend_api.py`): before the fix roughly 25 routes
carried no auth decorator at all, letting an anonymous caller add/edit/remove
players, edit/delete classes, and delete another coach's levels/evaluation
categories/notes by bare id. Talks to the API directly (no UI) since the
vulnerability is HTTP-layer and the UI never sent unauthenticated requests.
Asserts: every now-guarded route rejects an anonymous caller with exactly 401;
legacy no-caller routes that were deleted outright answer 404/405; a non-owner
coach gets 403 attempting to delete another coach's level/evaluation category
or remove a player from another coach's roster (and the row survives); the
owning coach still succeeds (200); and a debug endpoint stays unreachable
anonymously even with its env gate on.

## Connections

Uses:
- ../helpers/auth: `COACH_USERNAME`/`COACH_PASSWORD`, `COACH_NOLEVELS_USERNAME`/`COACH_NOLEVELS_PASSWORD` (a second coach account for cross-ownership 403 checks)
- ../helpers/api: `API_APP`, `API_AUTH`

Used by: —

Semantically related (not imports): pins the same auth/ownership boundary
class as `security/training-confirm-authz.spec.ts` and
`security/training-players-role-authz.spec.ts` (sibling specs in this folder),
against the backend `modules/frontend_api.py` blueprint.
