A many-to-many (or many-to-many-with-metadata) junction between two backend entities, implemented as a full id-bearing `db.Model` row rather than a plain SQLAlchemy secondary table — giving the junction its own id and Model mixin so it can be independently queried, deleted and edited through the generic admin editor (`legacy-admin-editor`), and so it can carry extra columns beyond the two foreign keys (`role` on the exercise-sharing junctions, `level_id`/`side`/`notes` on `Association_CoachPlayer`). The one exception is `exercise_group_exercises` (in `exercise.py`), a genuine plain secondary table with no extra columns — the only many-to-many in the backend models scope that does NOT follow this pattern.

## Implemented by
`backend/padel_app/models/Association_CoachClub.py`
`backend/padel_app/models/Association_CoachExercise.py`
`backend/padel_app/models/Association_CoachExerciseGroup.py`
`backend/padel_app/models/Association_CoachLesson.py`
`backend/padel_app/models/Association_CoachLessonInstance.py`
`backend/padel_app/models/Association_CoachPlayer.py`
`backend/padel_app/models/Association_PlayerClub.py`
`backend/padel_app/models/Association_PlayerLesson.py`
`backend/padel_app/models/Association_PlayerLessonInstance.py`
`backend/padel_app/models/exercise.py`

## Related concepts
[[coach-scoped-data]]
