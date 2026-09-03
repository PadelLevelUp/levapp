---
id: training.exercise-view
status: implemented
depends_on: [training.exercises]
implements: ../../specs-business/training/coach-builds-exercise-library.business.md
governed_by: []
---

# training.exercise-view


### Intent
Browse and filter the exercise library.

### Rules
1. `GET /api/app/exercises` returns all exercises for the coach
2. Frontend page: `/training/exercises` with ExerciseList component
3. Filterable by type and difficulty
4. Shows name, type badge, difficulty indicator, court diagram preview
