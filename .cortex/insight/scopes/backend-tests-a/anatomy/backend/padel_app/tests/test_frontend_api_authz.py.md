---
path: backend/padel_app/tests/test_frontend_api_authz.py
extracted_at: 2026-09-03T00:00:00Z
extraction_level: 2
size_lines: 853
size_tokens: 7539
centrality: medium
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "8f714e4f3d60afbee0ed147ff501e2e16878e9ce87f31a427d0d141089392072"
---

## Purpose

PAD-92 (and PAD-115) — the `/api/app` blueprint (`modules/frontend_api.py`)
must not expose unauthenticated routes, and an authenticated coach must
not reach another coach's data. Before PAD-92, ~25 routes carried no auth
decorator and services read `coachId`/`playerId`/`id` straight from the
request body — `delete/coach_level`, `delete/evaluation_category`,
`delete/coach_note` were the sharpest (bare id + `.first_or_404().delete()`
= anonymous deletion of any coach's row). Contract pinned per route:
anonymous -> 401 nothing written; other coach -> 403 nothing written;
owning coach -> 2xx. Section 1 parametrizes ~10 write/read routes for the
anonymous-401 case (asserted BEFORE payload validation — a 400 would be as
much of a failure as a 200) plus a dedicated no-mutation check for the
three bare-id delete routes. Section 2 (IDOR) parametrizes the same routes
for "authenticated as coach B, targeting coach A's data" -> 403 and
nothing mutated, including that a body `coachId` cannot impersonate
another coach. Section 3 confirms the owning coach still succeeds.
Section 4 confirms ~14 legacy no-caller routes are gone (404/405) and
`test_url_map_has_no_unauthenticated_write_routes` is a blanket structural
check: every `/api/app` POST/PUT/DELETE rule not on an explicit public
allowlist must have a JWT-wrapped view (detected via `__wrapped__`) — a
regression guard against a FUTURE route reintroducing the hole. Section 5
pins the notification debug endpoint fails closed: 401 without auth even
with the feature flag on, 404 when the flag is off (even authenticated).
Section 6 (PAD-115) covers `POST /class_instance/training/confirm`, a
route PAD-92/PAD-103 missed entirely because it never dereferenced a coach
— it silently SUCCEEDED for anyone (live IDOR, not a wrong-status bug).
Uses exact `==` status assertions (never `!= 200`) because the pre-fix
behaviour was itself a 200. Pins: anonymous 401 (existing plan untouched);
student (has Player, no Coach) 403; other coach targeting coach A's class
403 AND coach A's existing plan is intact (pre-fix code deleted all rows
before inserting, so even a "failed" write wiped the victim's plan);
exercise access is `Association_CoachExercise` role `owner` or `follower`
(read access) — a follower may plan it, a non-owner/non-follower exercise
is 403; the whole request is atomic (one inaccessible exercise id poisons
the entire save, no partial write); a legacy/admin-CRUD-created `Exercise`
with `owner_coach_id` set but NO association row is still allowed for its
real owner (403 for anyone else); duplicate exercise ids in one request
collapse rather than 500 on a composite-PK duplicate insert; malformed
bodies (missing `classInstance`, non-integer exercise ids) are 400 never
500; and critically, a REJECTED request against a not-yet-materialized
recurring occurrence must not materialize a `LessonInstance` row (the
pre-fix `confirm_training_service` called `get_or_materialize_instance()`
before any check).

## Connections

- Uses: models `User`, `Player`, `Association_CoachPlayer`, `CoachLevel`,
  `EvaluationCategory`, `CoachPlayerNote`, `Lesson`, `LessonInstance`,
  `Coach`, `Club`, `Association_CoachLesson`,
  `Association_CoachLessonInstance`, `Exercise`,
  `Association_CoachExercise`, `LessonInstanceTraining`;
  `flask_jwt_extended.create_access_token`; reads `app.url_map` and
  `app.view_functions` directly for the structural JWT-wrapping check.
- Used by: (none — leaf test file)
- Semantically related (not imports): the per-route
  anonymous/other-coach/owner contract this file establishes for `/api/app`
  is the same contract `test_generic_crud_auth.py` pins for the SEPARATE
  `/api` generic-editor blueprint (admin-only, not coach-scoped); the
  `Association_CoachExercise` owner/follower read-access model recurs
  nowhere else in this scope.
