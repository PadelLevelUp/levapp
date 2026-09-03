---
id: training.exercises
status: implemented
depends_on: [auth.login, levels.coach-levels]
implements: ../../specs-business/training/coach-builds-exercise-library.business.md
governed_by: []
---

# training.exercises


### Intent
Coaches create and manage a library of padel exercises with types, difficulty, court diagrams, and level targeting.

### Entities
- **Exercise** (`exercises`): name, description, type (enum), custom_type, difficulty (1-5), level_ids (JSON array of CoachLevel IDs), diagram (JSON CourtDiagram), notes, owner_coach_id
- **Association_CoachExercise** (`coach_exercise`): coach_id, exercise_id, role (owner|follower)

### Rules
1. Types: attack, defense, serve, return, volley, transition, warm_up, footwork, custom
2. `custom_type` used when type is "custom"
3. Difficulty: 1 (Beginner) to 5 (Expert)
4. `level_ids`: JSON array of CoachLevel IDs this exercise targets
5. `diagram`: Full CourtDiagram JSON (`{elements: [{id, type, x, y, endX, endY, label, curve, rotation}]}`)
6. Element types: player_1, player_2, player_3, player_4, coach, cone, blocker, ball, arrow, movement
7. Owner coach has full CRUD; follower coaches have read access
8. CRUD: GET/POST/PUT/DELETE `/api/app/exercises/{id}`
9. Every exercise endpoint is **coach-only** and returns **403** to a caller with no coach profile.
   The role check belongs on the route (`require_coach()`), not only in the service: today the 403
   is produced incidentally by each service's own `if coach is None` guard, so the contract holds
   only for as long as every service remembers to check. A service refactor that dropped its guard
   would silently turn these into 500s, which is the failure mode `settings.role-scope` rule 7
   already prohibits elsewhere.

### Acceptance Criteria

#### Create exercise
- **Given** an authenticated coach
- **When** they POST to `/api/app/exercises` with `{"name": "Cross Court Rally", "type": "attack", "difficulty": 3}`
- **Then** an Exercise record is created with owner_coach_id = coach's id
- **And** a coach_exercise association with role "owner" is created

#### Filter by type
- **Given** 5 exercises: 2 attack, 2 defense, 1 serve
- **When** filtering by type "attack"
- **Then** only the 2 attack exercises are returned

#### Edit exercise
- **Given** an exercise owned by the coach
- **When** they PUT to `/api/app/exercises/{id}` with updated data
- **Then** the exercise is updated

#### Delete exercise
- **Given** an exercise owned by the coach
- **When** they DELETE `/api/app/exercises/{id}`
- **Then** the exercise is removed
