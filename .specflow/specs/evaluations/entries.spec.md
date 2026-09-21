---
id: evaluations.entries
status: implemented
depends_on: [evaluations.categories, players.create]
implements: ../../specs-business/evaluations/coach-evaluates-a-player.business.md
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
6. **A save writes only the scores the coach gave (PAD-337, B-111).** The evaluation form (web
   sheet and iOS form) opens a category with no score as *unrated*: its control rests at the scale
   midpoint as a starting position, but its value reads "not rated", never a number. Scoring it
   (moving the slider or pressing its stepper) rates it; a reset control returns any category the
   coach changed to how it opened (unrated, or its existing score). On save the client posts only
   the categories whose value differs from how they opened. An untouched category submits nothing.
   A category that already had a score opens pre-filled with it, and is posted only if changed.
   "Changed" is judged against how the form opened, not against the server at save time. If the
   score changed elsewhere (another device, another tab) while the form was open, an untouched
   category is still not re-posted; the other change stands. Rule 7's "equal to the latest"
   compares with the latest score only, so re-rating back to an earlier grade (5 → 3 → 5) is
   written.
7. **`POST /api/app/add_evaluation_entry` backs rule 6 up for every caller.** A score whose `value`
   is null is an abstention and writes nothing. A score equal to the category's latest score for
   that coach-player writes no new entry, so a re-posted unchanged score cannot move `evaluatedAt`.
   This keeps App Store builds that still post every category harmless for categories that already
   hold a score. It cannot tell their midpoint seed for a never-scored category from a real grade;
   those builds keep writing it until they update. **Known gap:** a never-scored category saved from a 1.0/1.1.0 App Store client still gets a midpoint entry; the next App Store build (PAD-351) removes it. Rows already written from midpoint seeds stay as
   they are: nothing in the database tells a fabricated midpoint from an intended one (Coordinator
   decision, 2026-09-16).
8. **A score is recorded only in one of the calling coach's own categories (PAD-370, B-145, compass
   R-002).** `POST /api/app/add_evaluation_entry` ignores a score whose `categoryId` is another coach's
   category, an id that does not exist, or not a number: nothing is written for it and the response is
   the same `200 {status, playerId}`. Ignored rather than refused because App Store 1.0/1.1.0 post
   every category in one body, the save is not atomic, and they treat any non-2xx as a failed save — a
   build still holding a category that was deleted on another device must keep being able to save.

### Acceptance Criteria

#### Record evaluation
- **Given** a player "Alice" with category "Forehand" (scale 1-10)
- **When** coach POSTs to `/api/app/coach/evaluation/0` with `{"coach_player_id": 5, "category_id": 1, "score": 7.5, "comment": "Good progress"}`
- **Then** an EvaluationEntry is created with score 7.5

#### Latest per category
- **Given** Alice has Forehand scores: 5 (Jan), 7 (Feb), 8 (Mar)
- **When** querying `coach_player.current_evaluations`
- **Then** only the score 8 (Mar) is returned for Forehand

#### An untouched category writes nothing (rules 6-7)
- **Given** a player with no Volley score and categories Forehand and Volley
- **When** the coach opens the evaluation form, scores Forehand 8, leaves Volley alone and saves
- **Then** exactly one entry is written, for Forehand; the player profile has no Volley evaluation

#### Reset returns a category to unrated (rule 6)
- **Given** the coach has moved an unrated category's control in the open form
- **When** they press its reset control and save
- **Then** that category reads "not rated" again and no entry is written for it

#### A score for a category that is not the coach's own is ignored (rule 8)
- **Given** coach Ana with category Forehand and her student Rui, and coach Bea with category Serve
- **When** Ana posts `{"playerId": Rui, "scores": [{"categoryId": <Bea's Serve>, "value": 3}, {"categoryId": 987654, "value": 3}, {"categoryId": <Forehand>, "value": 6}]}`
- **Then** the response is `200 {"status": "ok", "playerId": Rui}`, exactly one entry is written — Forehand 6 — and
  Rui's profile for Ana carries no Serve evaluation

#### Null and unchanged scores are not written (rule 7)
- **Given** Forehand's latest score for the player is 8
- **When** a client posts `{"categoryId": Forehand, "value": 8}` and `{"categoryId": Volley, "value": null}`
- **Then** no entry is written for either, and Forehand's `evaluatedAt` is unchanged
