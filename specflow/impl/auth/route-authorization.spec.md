---
id: auth.route-authorization
status: implemented
depends_on: [auth.login]
serves: [P-AUTH-2]
governed_by: []
---

# auth.route-authorization

> Written 2026-11-09 during the port to Cortex 4.0, from the tests of PAD-92
> (`backend/padel_app/tests/test_frontend_api_authz.py`). The guard existed and was tested; no spec
> stated it across routes.

### Intent
Every route of the product API that reads or changes a coach's data answers only that coach, signed
in. This leaf states the guard once, for all routes. What each route does is in its own spec.

### Entities
- **READS:** the token's user and their Coach row; the row a request names (a level, an evaluation
  category, a note, a roster link, a class), to compare its coach with the caller.

### Rules
1. **No write without a session.** Every `POST`, `PUT` and `DELETE` route under `/api/app` requires
   a valid token, except the three a person uses before they have a session: activation
   (`auth.activate`) and the two invitation accepts. An anonymous call answers 401 before its body
   is read, and writes nothing.
2. **A coach acts only on their own data.** A route that names a row answers 403 when the row
   belongs to another coach, and changes nothing. A `coachId` in the body never replaces the
   caller: naming another coach there is 403.
3. **Routes nobody calls are gone.** The unauthenticated generic create and edit routes that PAD-92
   found with no caller answer 404 or 405.
4. **A debug route needs the E2E flag and a session.** With `E2E_DEBUG_ENDPOINTS` off it answers
   404; with it on, 401 without a token.

### Acceptance Criteria

#### AUTH-ROUTE-AUTHORIZATION-1: An anonymous caller is refused before anything is read or written (rule 1)
- **Given** no `Authorization` header
- **When** a write route of the product API is called, with a body that would otherwise be accepted or refused
- **Then** the answer is 401, never 400 or 200, and no row is created, changed or deleted
- **And** no `POST`, `PUT` or `DELETE` route under `/api/app` is without the session guard, apart from activation and the two invitation accepts
test: `backend/padel_app/tests/test_frontend_api_authz.py` › `test_anonymous_caller_is_rejected` (+3 more)

#### AUTH-ROUTE-AUTHORIZATION-2: Another coach's data is refused and left as it was, and its owner is served (rule 2)
- **Given** coach A's level, evaluation category, note, player and class, and coach B signed in
- **When** B deletes A's level, category or note, edits or removes A's player, edits or removes A's class, or reads A's class
- **Then** each answers 403 and the row is unchanged
- **And** B adding a player with A's `coachId` in the body answers 403
- **And** A doing the same things to their own data is answered 200
test: `backend/padel_app/tests/test_frontend_api_authz.py` › `test_other_coach_cannot_delete_level` (+14 more)

#### AUTH-ROUTE-AUTHORIZATION-3: The routes nobody calls are gone (rule 3)
- **Given** the generic routes `POST /api/app/user`, `/player`, `/coach`, `/coach_level`, `/lesson`, `/calendar_block`, their by-id forms, and `GET /api/app/lessons` and `/calendar_block`
- **When** each is called
- **Then** it answers 404 or 405
test: `backend/padel_app/tests/test_frontend_api_authz.py` › `test_legacy_routes_are_removed`

#### AUTH-ROUTE-AUTHORIZATION-4: A debug route needs the E2E flag and a session (rule 4)
- **Given** `E2E_DEBUG_ENDPOINTS` on
- **When** a debug route is called with no token
- **Then** the answer is 401
- **And** with the flag off the same routes answer 404, even to a signed-in coach
test: `backend/padel_app/tests/test_frontend_api_authz.py` › `test_debug_endpoint_requires_jwt` (+1 more)

### Notes
- The per-route statements stay where they are: `levels.coach-levels` rule 15,
  `evaluations.categories` rule 7, `players.remove` rule 1, `classes.detail-visibility` rule 5.
- `client.pull-to-refresh` states rule 4 for `/api/app/debug/stall`.
