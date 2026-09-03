# Association table

A many-to-many (or, for the Coach<->LessonInstance/Coach<->Lesson cases, effectively many-to-many-with-metadata) junction between two entities, implemented as a full id-bearing `db.Model` + `model.Model` row rather than a plain SQLAlchemy secondary table. Giving the junction its own id and Model mixin lets it be independently queried, deleted, and edited through the generic admin editor, and lets it carry extra columns beyond the two foreign keys (e.g. `role` on the exercise-sharing junctions, `level_id`/`side`/`notes` on Association_CoachPlayer). The one exception in this scope is `exercise_group_exercises` (exercise.py), a genuine plain secondary table with no extra columns -- the only M2M here that does NOT follow this pattern.

**Implementing files:**

- backend/padel_app/models/Association_CoachClub.py
- backend/padel_app/models/Association_CoachExercise.py
- backend/padel_app/models/Association_CoachExerciseGroup.py
- backend/padel_app/models/Association_CoachLesson.py
- backend/padel_app/models/Association_CoachLessonInstance.py
- backend/padel_app/models/Association_CoachPlayer.py
- backend/padel_app/models/Association_PlayerClub.py
- backend/padel_app/models/Association_PlayerLesson.py
- backend/padel_app/models/Association_PlayerLessonInstance.py
- backend/padel_app/models/exercise.py (the one exception -- plain secondary table, not this pattern)

**Related concepts:** [[coach-scoped-data]]
