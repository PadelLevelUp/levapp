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
6. **A coach never holds two categories with the same `name`** (PAD-273, audit M14). The database
   enforces it with the unique index `uq_evaluation_categories_coach_name` on `(coach_id, name)`.
   The settings upsert (`upsert_evaluation_categories`) and the spreadsheet/AI import both match on
   the name first, so neither can trip it. The migration creates the index only when no duplicate
   exists; otherwise it logs a WARNING with the count.
7. Deleting a category deletes every score recorded in it. Before deleting, the web and iOS apps show
   `GET /api/app/evaluation_category/{id}/impact` (`{name, scores, players}`: how many scores, across
   how many players) and ask the coach to type the category's name. `POST
   /api/app/delete/evaluation_category` writes one `deletion_audit` row (`entity`
   `evaluation_category`, the acting coach's user, the name, the counts) in the same transaction
   (PAD-274). A category that was never saved is removed from the form without asking.

### Acceptance Criteria

#### Create evaluation category
- **Given** an authenticated coach
- **When** they POST to `/api/app/coach/evaluation_category` with `{"name": "Forehand", "scale_min": 1, "scale_max": 10}`
- **Then** an EvaluationCategory record is created

#### Bulk upsert categories
- **Given** a coach with categories [Forehand, Backhand]
- **When** they submit [Forehand (unchanged), Backhand (updated max=5), Volley (new)]
- **Then** Forehand is unchanged, Backhand max is 5, Volley is created

#### A coach cannot hold two categories with the same name
- **Given** coach `maria` with a category named `Serve`
- **When** a second category named `Serve` is written for `maria`
- **Then** the database refuses it (integrity error)
- **And** another coach can still have a category named `Serve`

#### Deleting a category shows its impact and is audited
- **Given** coach Ana's category "Serve" with one score for her student Rui
- **When** she GETs `/api/app/evaluation_category/<Serve>/impact`
- **Then** it answers `{"name": "Serve", "scores": 1, "players": 1}`
- **When** she then POSTs `/api/app/delete/evaluation_category` with `{"id": <Serve>}`
- **Then** the category and its score are gone, and one `deletion_audit` row by Ana names "Serve" with
  `"scores": 1`

#### The delete button waits for the typed name
- **Given** the settings page with the saved category "Serve"
- **When** Ana presses its delete button
- **Then** a confirmation shows the scores and players it would remove, and its delete stays disabled
  until she types "Serve"

