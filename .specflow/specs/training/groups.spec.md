---
id: training.groups
status: implemented
depends_on: [training.exercises]
implements: ../../specs-business/training/coach-relies-on-training.business.md
governed_by: []
---

# training.groups


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
