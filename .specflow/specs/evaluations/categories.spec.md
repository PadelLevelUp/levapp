---
id: evaluations.categories
status: implemented
depends_on: [auth.login]
implements: ../../specs-business/evaluations/coach-evaluates-a-player.business.md
governed_by: []
---

# evaluations.categories


### Intent
Coaches define custom evaluation categories (e.g., Forehand, Volley, Serve) with configurable scoring scales.

### Entities
- **EvaluationCategory** (`evaluation_categories`): coach_id, name (e.g., "Forehand"), scale_min (default 1), scale_max (default 10)

### Rules
1. Categories are coach-specific
2. Each has a name and a min/max scale (default 1-10)
3. CRUD via POST/PATCH `/api/app/coach/evaluation_category/{id}`
4. Bulk upsert via `upsert_evaluation_categories()` from settings
5. Categories define what dimensions players are scored on

### Acceptance Criteria

#### Create evaluation category
- **Given** an authenticated coach
- **When** they POST to `/api/app/coach/evaluation_category` with `{"name": "Forehand", "scale_min": 1, "scale_max": 10}`
- **Then** an EvaluationCategory record is created

#### Bulk upsert categories
- **Given** a coach with categories [Forehand, Backhand]
- **When** they submit [Forehand (unchanged), Backhand (updated max=5), Volley (new)]
- **Then** Forehand is unchanged, Backhand max is 5, Volley is created
