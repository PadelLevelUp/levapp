---
id: training.lesson-planning
status: implemented
depends_on: [training.exercises, classes.instances]
serves: [P-TRAINING-2]
governed_by: []
---

# training.lesson-planning


### Intent
Plan which exercises will be used in a specific class instance.

### Entities
- **LessonInstanceTraining** (`lesson_instance_training`): lesson_instance_id, exercise_id (composite PK)

### Rules
3. ClassDetailSheet shows `plannedExerciseIds` and a training planning section
4. `confirmClassTraining()` API call saves the exercise selection
5. `POST /api/app/class_instance/training/confirm` is **coach-only**. The acting coach is derived
   from the JWT via `require_coach()`; a caller with no coach profile gets **403** before any query
   or write happens. The request body never names the acting coach.
6. The acting coach must own the target class — `require_owned_class(coach, "LessonInstance"|"Lesson", …)`
   on the same `originalId`/`parentClassId` shape the route already accepts. A non-owning coach gets
   **403**, not 404, and nothing is written or materialized.
7. Every id in `exerciseIds` must be **accessible to the acting coach**: owned by them
   (`owner_coach_id`), or linked to them by an `Association_CoachExercise` row in either the `owner`
   or the `follower` role (the same set `training.exercises` rule 7 grants read access to, and the same set
   `get_exercises_for_coach` returns). An id outside that set is **403** and the whole request is
   rejected atomically: no partial plan is written.
8. All three checks run **before** `confirm_training_service` is called. A rejected request must
   leave `lesson_instance_training` byte-for-byte unchanged and must not lazily materialize a
   `LessonInstance` for a recurring lesson. For the owning coach, planning an occurrence that has no
   row yet creates it (`confirm_training_service` materialises it), and the plan is saved on it.

9. The confirm body names the class and a list of numeric exercise ids: a body with no class, or with an id that is not a number, is 400. The list replaces the plan: an empty list clears it, and an id sent twice is stored once.

### Acceptance Criteria

#### TRAINING-LESSON-PLANNING-1: Plan training for class
- **Given** a lesson instance and exercises [1, 3, 5]
- **When** coach POSTs to confirm training with exercise_ids [1, 3, 5]
- **Then** 3 LessonInstanceTraining records are created

#### TRAINING-LESSON-PLANNING-2: Anonymous caller is rejected
- **Given** no Authorization header
- **When** `POST /api/app/class_instance/training/confirm` is called
- **Then** the response status is exactly 401
- **And** no LessonInstanceTraining rows are written

#### TRAINING-LESSON-PLANNING-3: Student caller is rejected
- **Given** an authenticated user with a player profile and no coach profile
- **When** they POST to confirm training on any class
- **Then** the response status is exactly 403 (never 500, never a silent success)
- **And** no LessonInstanceTraining rows are written

#### TRAINING-LESSON-PLANNING-4: Another coach cannot plan training on a class they do not own
- **Given** coach B authenticated, and a lesson instance owned by coach A
- **When** coach B POSTs to confirm training on coach A's instance
- **Then** the response status is exactly 403
- **And** coach A's existing training plan for that instance is unchanged

#### TRAINING-LESSON-PLANNING-5: A coach cannot plan an exercise they have no access to
- **Given** coach B authenticated and owning their own class, and an exercise owned by coach A that
  coach B neither owns nor follows
- **When** coach B POSTs to confirm training on their own class with that exercise id
- **Then** the response status is exactly 403
- **And** no LessonInstanceTraining rows are written for coach B's instance — not even for the
  accessible ids sent in the same request

#### TRAINING-LESSON-PLANNING-6: A followed exercise is accepted
- **Given** coach B has a `follower` association to an exercise owned by coach A
- **When** coach B POSTs to confirm training on their own class with that exercise id
- **Then** the request succeeds and the exercise is planned

#### TRAINING-LESSON-PLANNING-7: Rejection never materializes an instance
- **Given** a recurring lesson owned by coach A with no instance row for a given date
- **When** coach B POSTs to confirm training for that lesson and date
- **Then** the response status is exactly 403
- **And** no LessonInstance row exists for that lesson and date afterwards

#### TRAINING-LESSON-PLANNING-8: The plan becomes exactly the exercises sent (rules 4, 9)
- **Given** a coach who owns a class whose plan holds one exercise
- **When** they confirm with an empty list, and then with the same exercise id twice
- **Then** the first answers 200 and the class has no planned exercise
- **And** the second answers 200 and the plan holds that exercise once
- **And** a body that names no class, or an exercise id that is not a number, answers 400
test: `backend/padel_app/tests/test_frontend_api_authz.py` › `test_confirm_training_rejects_a_malformed_body` (+2 more)

#### TRAINING-LESSON-PLANNING-9: An exercise the coach owns counts as accessible without an association row (rule 7)
- **Given** an exercise whose `owner_coach_id` is coach B, with no `Association_CoachExercise` row, and a class B owns
- **When** B confirms that class's plan with that exercise
- **Then** the answer is 200 and the plan holds it
test: `backend/padel_app/tests/test_frontend_api_authz.py` › `test_confirm_training_allows_an_exercise_owned_without_an_association`

#### TRAINING-LESSON-PLANNING-10: An owner planning an occurrence with no row yet creates it (rule 8)
- **Given** a recurring lesson owned by coach A with no instance row for a given date, and an exercise A owns
- **When** A confirms training for that lesson and date
- **Then** the answer is 200 and a LessonInstance row exists for that lesson and date
- **And** the plan on it holds that exercise
- Code to follow: add the test for this criterion in `backend/padel_app/tests/test_frontend_api_authz.py`; none covers the owner's case today.
