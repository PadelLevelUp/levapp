# evaluations — Player Evaluation System

## evaluations.categories

---
id: evaluations.categories
status: implemented
depends_on: [auth.login]
---

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

---

## evaluations.entries

---
id: evaluations.entries
status: implemented
depends_on: [evaluations.categories, players.create]
---

### Intent
Coaches record evaluation scores for players over time, tracking progress across categories.

### Entities
- **EvaluationEntry** (`evaluation_entries`): coach_player_id (FK → coach_in_player), category_id, score (float), comment (500 chars), evaluated_at

### Rules
1. Entries are scoped to a coach-player relationship + category
2. Multiple entries per category over time (historical tracking)
3. `current_evaluations` property: latest entry per category (deduplicated)
4. Score must be within category's scale_min/scale_max range
5. `POST /api/app/coach/evaluation/{entry_id}` to add or edit

### Acceptance Criteria

#### Record evaluation
- **Given** a player "Alice" with category "Forehand" (scale 1-10)
- **When** coach POSTs to `/api/app/coach/evaluation/0` with `{"coach_player_id": 5, "category_id": 1, "score": 7.5, "comment": "Good progress"}`
- **Then** an EvaluationEntry is created with score 7.5

#### Latest per category
- **Given** Alice has Forehand scores: 5 (Jan), 7 (Feb), 8 (Mar)
- **When** querying `coach_player.current_evaluations`
- **Then** only the score 8 (Mar) is returned for Forehand

---

## evaluations.player-view

---
id: evaluations.player-view
status: implemented
depends_on: [evaluations.entries]
---

### Intent
Display evaluation history and current scores on the player detail page, with chart visualization.

### Rules
1. Player profile page shows current scores per category
2. Frontend renders evaluation history as a chart (Recharts)
3. Scores shown with category name, scale, and latest value
4. Coach can add new evaluations from the player detail page

---

## evaluations.bulk-import

---
id: evaluations.bulk-import
status: implemented
depends_on: [evaluations.entries, import.confirm]
---

### Intent
Bulk import evaluation entries as part of the data import flow.

### Rules
1. `bulk_create_evaluation_entries()` processes imported evaluation data
2. Creates entries linked to coach_player_id and category_id
3. Part of the broader bulk import system
