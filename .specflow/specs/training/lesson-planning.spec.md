---
id: training.lesson-planning
status: implemented
depends_on: [training.exercises, classes.instances]
implements: ../../specs-business/training/coach-relies-on-training.business.md
governed_by: []
---

# training.lesson-planning


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
