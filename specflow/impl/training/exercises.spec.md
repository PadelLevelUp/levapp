---
id: training.exercises
status: implemented
depends_on: [auth.login, levels.coach-levels]
serves: [P-TRAINING-1]
governed_by: []
---

# training.exercises


### Intent
Coaches create and manage a library of padel exercises with types, difficulty, court diagrams, and level targeting.

### Entities
- **Exercise** (`exercises`): name, description, type (enum), custom_type, difficulty (1-5), level_ids (JSON array of CoachLevel IDs), diagram (JSON CourtDiagram), notes, owner_coach_id
- **Association_CoachExercise** (`coach_exercise`): coach_id, exercise_id, role (owner|follower)

### Rules
1. Types: attack, defense, serve, return, volley, transition, warm_up, footwork, custom. The server
   refuses a type outside this list, for every client.
   - Code to follow: `POST` and `PUT /api/app/exercises` must answer 400 for a type outside the list; today only `exerciseFormSchema` checks it.
2. `custom_type` used when type is "custom"
3. Difficulty: 1 (Beginner) to 5 (Expert). The server refuses a difficulty outside 1 to 5, for every client.
   - Code to follow: `POST` and `PUT /api/app/exercises` must answer 400 for a difficulty outside 1 to 5; today only `exerciseFormSchema` checks it.
4. `level_ids`: JSON array of CoachLevel IDs this exercise targets
5. `diagram`: opaque JSON owned by the board spec. Two shapes exist: legacy v1
   `{elements: [{id, type, x, y, endX, endY, label, curve, rotation}]}` (`training.court-diagram`)
   and v2 `{version: 2, mode, pieces, steps}` (`training.tactical-board`). The backend stores and
   returns whichever it receives; the frontend upgrades v1 to v2 on read and writes v2.
6. v1 element types: player_1, player_2, player_3, player_4, coach, cone, blocker, ball, arrow,
   movement. v2 piece kinds and step shape: see `training.tactical-board`.
7. Owner coach has full CRUD; follower coaches have read access. Sharing an exercise with another
   coach is wanted behaviour but **not built yet**: a follower row is honoured on read and on
   planning, and no route or screen writes one today.
8. CRUD: GET/POST/PUT/DELETE `/api/app/exercises/{id}`
9. Every exercise endpoint is **coach-only** and returns **403** to a caller with no coach profile.
   The role check belongs on the route (`require_coach()`), not only in the service: today the 403
   is produced incidentally by each service's own `if coach is None` guard, so the contract holds
   only for as long as every service remembers to check. A service refactor that dropped its guard
   would silently turn these into 500s, which is the failure mode `settings.role-scope` rule 7
   already prohibits elsewhere.

### Acceptance Criteria

#### TRAINING-EXERCISES-1: Create exercise
- **Given** an authenticated coach
- **When** they POST to `/api/app/exercises` with `{"name": "Cross Court Rally", "type": "attack", "difficulty": 3}`
- **Then** an Exercise record is created with owner_coach_id = coach's id
- **And** a coach_exercise association with role "owner" is created

#### TRAINING-EXERCISES-2: Filter by type
- **Given** 5 exercises: 2 attack, 2 defense, 1 serve
- **When** filtering by type "attack"
- **Then** only the 2 attack exercises are returned

#### TRAINING-EXERCISES-3: Edit exercise
- **Given** an exercise owned by the coach
- **When** they PUT to `/api/app/exercises/{id}` with updated data
- **Then** the exercise is updated

#### TRAINING-EXERCISES-4: Delete exercise
- **Given** an exercise owned by the coach
- **When** they DELETE `/api/app/exercises/{id}`
- **Then** the exercise is removed

#### TRAINING-EXERCISES-5: A coach reads and writes their own exercises and groups (rules 7, 8, 9)
- **Given** a coach who owns one exercise and one group, and a coach who owns none
- **When** each lists exercises and groups, and the first creates, renames and deletes an exercise and creates a group
- **Then** the first coach's lists hold exactly their exercise and their group, with ids as strings, and the second coach's lists are empty
- **And** create answers 201, the rename 200 with the new name, the delete 204, and the group create 201
test: `backend/padel_app/tests/test_backend_500_fixes.py` › `test_exercises_endpoint_still_works_for_coach` (+3 more)

#### TRAINING-EXERCISES-6: Every exercise and group route answers an anonymous caller with 401 (rule 9)
- **Given** no `Authorization` header
- **When** each of the exercise and exercise-group routes is called with its method
- **Then** every answer is 401
test: `backend/padel_app/tests/test_training_players_role_authz.py` › `test_anonymous_callers_are_still_rejected`

#### TRAINING-EXERCISES-7: The exercise form refuses what rules 1 and 3 do not allow (rules 1, 3)
- **Given** the exercise form with a name, the type `volley` and difficulty 3
- **When** the coach submits it, and submits it again with a blank name, with a type outside the list, and with difficulty 0, 6 or 2.5
- **Then** the form's schema accepts the first and refuses each of the others
- **And** difficulty 1 and difficulty 5 are accepted
test: `frontend/packages/validation/src/index.test.ts` › `parses valid input` (+3 more)
