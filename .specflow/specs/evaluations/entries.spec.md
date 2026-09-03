---
id: evaluations.entries
status: implemented
depends_on: [evaluations.categories, players.create]
implements: ../../specs-business/evaluations/coach-relies-on-evaluations.business.md
governed_by: []
---

# evaluations.entries


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
