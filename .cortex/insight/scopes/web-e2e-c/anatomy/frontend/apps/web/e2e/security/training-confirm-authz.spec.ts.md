---
path: frontend/apps/web/e2e/security/training-confirm-authz.spec.ts
extracted_at: 2026-09-03T14:18:15Z
extraction_level: 2
size_lines: 280
size_tokens: 2401
centrality: medium
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "151d7565e29606e02de1d2690ff77f92c6ee042acb48af1d00ae0ef6d49f328d"
---

## Purpose

PAD-115 regression test: `POST /api/app/class_instance/training/confirm` was
`@jwt_required()` but never resolved/verified the acting coach, so any
authenticated user could silently write a training plan onto any coach's class
by enumerating instance ids — neither a 401 nor a 500, which is why it slipped
past the PAD-92 (missing decorator) and PAD-103 (null-coach crash) hardening
passes. Runs as `test.describe.serial` with shared `beforeAll`/`afterAll` state:
seeds the owner a real plan first so "the owner's plan survives an attack" is a
genuine assertion (the pre-fix service deleted all rows before inserting, so a
successful attack could wipe the owner's plan even while writing nothing
itself). Pins: anonymous -> 401; student (no coach profile) -> 403; another
coach on someone else's class -> 403 with the owner's plan intact; own class
but one exercise id from another coach's library -> 403 with nothing written
(no partial writes from a mixed batch); owner with their own exercise -> 200.
`afterAll` clears the plan and deletes the exercises it created, asserting
cleanup succeeded rather than firing-and-forgetting it.

## Connections

Uses:
- ../helpers/auth: `COACH_USERNAME`/`COACH_PASSWORD`, `COACH_NOLEVELS_USERNAME`/`COACH_NOLEVELS_PASSWORD`, `STUDENT_USERNAME`/`STUDENT_PASSWORD`
- ../helpers/api: `API_APP`, `API_AUTH`

Used by: —

Semantically related (not imports): reads the training plan back through
`/class_instance` (never `/calendar_event`, whose serializer always nulls
`plannedExerciseIds` — see `e2e-vacuous-assertion-calendar-event`); spec:
specs/training/spec.md -> training.lesson-planning, rules 5-8. Sibling to
`security/frontend-api-auth.spec.ts` and
`security/training-players-role-authz.spec.ts`.
