# training — Exercise Library & Training Planning

## training.exercises

---
id: training.exercises
status: implemented
depends_on: [auth.login, levels.coach-levels]
---

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

---

## training.groups

---
id: training.groups
status: implemented
depends_on: [training.exercises]
---

### Intent
Organize exercises into named groups (collections) for easier management and lesson planning.

### Entities
- **ExerciseGroup** (`exercise_groups`): name, description, owner_coach_id
- **exercise_group_exercises**: Junction table (exercise_group_id, exercise_id) — M:N
- **Association_CoachExerciseGroup** (`coach_exercise_group`): coach_id, exercise_group_id, role (owner|follower)

### Rules
1. Groups are named collections of exercises
2. Exercises can belong to multiple groups
3. CRUD: GET/POST/PUT/DELETE `/api/app/exercise-groups/{id}`
4. Add exercises: `POST /api/app/exercise_group/{id}/exercises`
5. Remove exercise: `DELETE /api/app/exercise_group/{id}/exercise/{exercise_id}`
6. Every exercise-group endpoint is **coach-only** and returns **403** to a caller with no coach
   profile, enforced on the route via `require_coach()` — same rationale as `training.exercises`
   rule 9.

### Acceptance Criteria

#### Exercise and group endpoints reject a student with 403
- **Given** an authenticated user with a player profile and no coach profile
- **When** they call any `/api/app/exercises` or `/api/app/exercise-groups` endpoint
- **Then** each response status is exactly 403, and no 500 is produced

#### Create group
- **Given** an authenticated coach
- **When** they POST to `/api/app/exercise-groups` with `{"name": "Warm-Up Routine", "description": "Standard warm-up"}`
- **Then** an ExerciseGroup is created

#### Add exercises to group
- **Given** a group with id 5
- **When** coach POSTs to `/api/app/exercise_group/5/exercises` with `{"exercise_ids": [1, 3, 7]}`
- **Then** the exercises are linked to the group

---

## training.court-diagram

---
id: training.court-diagram
status: implemented
depends_on: [training.exercises]
---

### Intent
Visual court diagram editor for exercises, allowing coaches to place players, cones, balls, and movement arrows on a padel court.

### Rules
1. Frontend-only interactive editor (CourtDiagram component)
2. Elements are draggable on a court canvas
3. Element types: player_1-4, coach, cone, blocker, ball, arrow, movement
4. Each element: id, type, x, y, endX, endY (for arrows), label, curve, rotation
5. Serialized as JSON and stored in Exercise.diagram

---

## training.lesson-planning

---
id: training.lesson-planning
status: implemented
depends_on: [training.exercises, classes.instances]
---

### Intent
Plan which exercises will be used in a specific class instance.

### Entities
- **LessonInstanceTraining** (`lesson_instance_training`): lesson_instance_id, exercise_id (composite PK)

### Rules
1. `POST /api/app/lesson_instance/{id}/training` with exercise_ids to link exercises
2. `DELETE /api/app/lesson_instance/{id}/training/{exercise_id}` to unlink
3. ClassDetailSheet shows `plannedExerciseIds` and a training planning section
4. `confirmClassTraining()` API call saves the exercise selection
5. `POST /api/app/class_instance/training/confirm` is **coach-only**. The acting coach is derived
   from the JWT via `require_coach()`; a caller with no coach profile gets **403** before any query
   or write happens. The request body never names the acting coach.
6. The acting coach must own the target class — `require_owned_class(coach, "LessonInstance"|"Lesson", …)`
   on the same `originalId`/`parentClassId` shape the route already accepts. A non-owning coach gets
   **403**, not 404, and nothing is written or materialized.
7. Every id in `exerciseIds` must be **accessible to the acting coach** — i.e. have an
   `Association_CoachExercise` row for that coach, in either the `owner` or the `follower` role
   (the same set `training.exercises` rule 7 grants read access to, and the same set
   `get_exercises_for_coach` returns). An id outside that set is **403** and the whole request is
   rejected atomically: no partial plan is written.
8. All three checks run **before** `confirm_training_service` is called. A rejected request must
   leave `lesson_instance_training` byte-for-byte unchanged and must not lazily materialize a
   `LessonInstance` for a recurring lesson.

### Acceptance Criteria

#### Plan training for class
- **Given** a lesson instance and exercises [1, 3, 5]
- **When** coach POSTs to confirm training with exercise_ids [1, 3, 5]
- **Then** 3 LessonInstanceTraining records are created

#### Anonymous caller is rejected
- **Given** no Authorization header
- **When** `POST /api/app/class_instance/training/confirm` is called
- **Then** the response status is exactly 401
- **And** no LessonInstanceTraining rows are written

#### Student caller is rejected
- **Given** an authenticated user with a player profile and no coach profile
- **When** they POST to confirm training on any class
- **Then** the response status is exactly 403 (never 500, never a silent success)
- **And** no LessonInstanceTraining rows are written

#### Another coach cannot plan training on a class they do not own
- **Given** coach B authenticated, and a lesson instance owned by coach A
- **When** coach B POSTs to confirm training on coach A's instance
- **Then** the response status is exactly 403
- **And** coach A's existing training plan for that instance is unchanged

#### A coach cannot plan an exercise they have no access to
- **Given** coach B authenticated and owning their own class, and an exercise owned by coach A that
  coach B neither owns nor follows
- **When** coach B POSTs to confirm training on their own class with that exercise id
- **Then** the response status is exactly 403
- **And** no LessonInstanceTraining rows are written for coach B's instance — not even for the
  accessible ids sent in the same request

#### A followed exercise is accepted
- **Given** coach B has a `follower` association to an exercise owned by coach A
- **When** coach B POSTs to confirm training on their own class with that exercise id
- **Then** the request succeeds and the exercise is planned

#### Rejection never materializes an instance
- **Given** a recurring lesson owned by coach A with no instance row for a given date
- **When** coach B POSTs to confirm training for that lesson and date
- **Then** the response status is exactly 403
- **And** no LessonInstance row exists for that lesson and date afterwards

---

## training.exercise-view

---
id: training.exercise-view
status: implemented
depends_on: [training.exercises]
---

### Intent
Browse and filter the exercise library.

### Rules
1. `GET /api/app/exercises` returns all exercises for the coach
2. Frontend page: `/training/exercises` with ExerciseList component
3. Filterable by type and difficulty
4. Shows name, type badge, difficulty indicator, court diagram preview
