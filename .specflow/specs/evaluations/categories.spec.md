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
2. Each has a name and a min/max scale (default 1-10). Both settings editors open a new row at
   0–10, but the shared form layer reads a falsy value as "not sent", so a posted `scaleMin: 0` is
   stored as the model default 1 (B-136, PAD-367).
3. The routes, all under `/api/app`, JWT, coach: `GET /evaluation_categories` → `[{id, name,
   scaleMin, scaleMax}]`; `POST /add_evaluation_categories` with `[{name, scaleMin, scaleMax}]` →
   echoes the body; `GET /evaluation_category/{id}/impact` and `POST /delete/evaluation_category`
   (rule 7). There is no per-id create or edit route.
4. Bulk upsert via `upsert_evaluation_categories()` from settings, **keyed on `name`**: ids are
   never sent. A category absent from the body is not deleted. Renaming a saved category
   therefore inserts a new category and leaves the old one with its scores (B-125).
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
8. **The iOS categories editor loads once (PAD-392, B-155; number self-assigned, unconfirmed).** Names and
   scales are edited locally until Save, so the load effect must not re-run: it does not depend
   on `t` (`settings.coach-working-hours` rule 7). The web section already loaded with empty deps;
   the iOS twin had drifted and would replace unsaved edits when the language changed.

### Superseded by / Planned
Not built. A built-in catalogue, on/off, custom competencies, rename by id (resolves B-125) and an
id-addressed delete: `evaluations.competencies` (draft). The routes in rule 3 that App Store
1.0/1.1.0 call are frozen and will handle legacy categories only:
`evaluations.legacy-client-contract` (draft).

### Acceptance Criteria

#### Create evaluation category
- **Given** an authenticated coach
- **When** they POST to `/api/app/add_evaluation_categories` with `[{"name": "Forehand", "scaleMin": 1, "scaleMax": 10}]`
- **Then** an EvaluationCategory record is created and the response echoes the body

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


### Acceptance Criteria — the contract as shipped, pinned by PAD-362

Appended by PAD-362 (2026-09-21); same terms as the section of the same name in
`evaluations.entries`. Tests: `backend/padel_app/tests/test_pad362_evaluation_contract.py`.

#### The category list has exactly four keys per category
- **Given** a coach with two categories
- **When** they read `GET /api/app/evaluation_categories`
- **Then** they get a list of exactly `{id, name, scaleMin, scaleMax}` — `id` a JSON number — holding only their own categories
- **And** a student gets 403

#### The settings upsert is keyed on the name and echoes the request
- **Given** a coach with Forehand (1–10) and Volley
- **When** they post `[{Forehand, 2, 5}, {Smash, 1, 7}]` to `POST /api/app/add_evaluation_categories`
- **Then** the response is the request body, without ids
- **And** Forehand is the same row with scale 2–5, Smash is new, and Volley — left out of the body — still exists

#### A rename is an insert (B-125 — today's behaviour)
- **Given** Forehand holds a score
- **When** the coach posts the list with Forehand renamed to "Forehand drive"
- **Then** the coach holds both Forehand and Forehand drive; the score, and the player profile, stay under Forehand

#### A scale minimum of 0 is dropped (B-136 — today's behaviour)
- **When** a coach posts a new category with `scaleMin: 0, scaleMax: 10`
- **Then** the response says 0 and the category is stored and listed as 1–10
- **And** an existing category posted with `scaleMin: 0` keeps its minimum while its maximum changes

#### A delete with only an id (what iOS 1.1.0 sends)
- **Given** Forehand holds two scores and Volley one
- **When** the coach posts `{id: Forehand}` to `POST /api/app/delete/evaluation_category` without reading the impact first
- **Then** Forehand and its two scores are gone, Volley's score remains, and exactly one `deletion_audit` row names Forehand
- **And** another coach's category id answers 403 and deletes nothing
