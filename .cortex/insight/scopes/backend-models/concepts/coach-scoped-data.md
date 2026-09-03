# Coach-scoped data

Nearly every top-level entity in this domain is scoped to a single coach, directly via a `coach_id` FK or transitively (a LessonInstance is scoped through its parent Lesson's club/coach relations). This is the primary data-isolation boundary: one coach's students, classes, exercises, evaluation rubrics, seasons and notification config are logically partitioned from every other coach's, even when they share a Club.

**Implementing files:**

- backend/padel_app/models/coaches.py
- backend/padel_app/models/lessons.py
- backend/padel_app/models/lesson_instances.py
- backend/padel_app/models/exercise.py
- backend/padel_app/models/evaluation_category.py
- backend/padel_app/models/coach_levels.py
- backend/padel_app/models/notification_config.py
- backend/padel_app/models/seasons.py
- backend/padel_app/models/bulk_import.py
- backend/padel_app/models/vacancy.py

**Related concepts:** [[association-table]], [[invitation-and-vacancy-engine-config]]
