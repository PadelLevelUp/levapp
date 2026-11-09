---
id: players.notes
status: implemented
depends_on: [players.create]
serves: [P-PLAYERS-1]
governed_by: []
---

# players.notes


### Intent
Coaches record strengths and weaknesses notes for their players.

### Entities
- **CoachPlayerNote** (`coach_player_notes`): coach_player_id, type (strength|weakness), text, created_at

### Rules
1. Notes are scoped to a coach-player relationship (not global)
2. Type is either `strength` or `weakness`
3. Text max 500 characters
4. `POST /api/app/add_coach_note` to add, `POST /api/app/delete/coach_note` to remove
5. **(PAD-374, `evaluations.history` rule 9) Where a coach edits them.** On web and on iOS alike,
   in the strengths-and-weaknesses card of the player's profile (web `PlayerStrengthsWeaknesses`,
   test id `sw-section`), through `POST /add_coach_note` and `POST /delete/coach_note`. They are
   no longer part of any evaluation form: the web evaluation sheet that also carried them was
   replaced by the record form, which does not. `e2e/evaluation-tools/player-notes.spec.ts`
   (US-44, US-45) is the proof that the card works on its own.

6. A note's text is required: a blank text answers 400 `text is required` and writes nothing.

### Acceptance Criteria

#### PLAYERS-NOTES-1: Add strength note
- **Given** a coach-player relationship for player "Alice"
- **When** coach POSTs to `/api/app/coach/note` with `{"player_id": 5, "type": "strength", "text": "Excellent forehand"}`
- **Then** a CoachPlayerNote is created
- **And** it appears in the player's profile under strengths

#### PLAYERS-NOTES-2: Delete note
- **Given** a strength note with id 10
- **When** coach POSTs to `/api/app/delete/coach_note` with `{"note_id": 10}`
- **Then** the note is deleted

#### PLAYERS-NOTES-3: A note needs text (rules 4, 6)
- **Given** a coach and a student on their roster
- **When** the coach POSTs `/api/app/add_coach_note` with a blank text, and then with "Fast feet"
- **Then** the blank one answers 400 and writes no note
- **And** the second answers 200 with the note's text
test: `backend/padel_app/tests/test_pad367_falsy_values_at_the_route.py` › `test_add_coach_note_refuses_an_empty_text_itself`

### Open questions

- **PLAYERS-NOTES-1 names a route and a body that do not exist.** It posts to `/api/app/coach/note` with `player_id`; the route is `POST /api/app/add_coach_note` and the key is `playerId` (`frontend_api.py:1935`, `coach_service.py:302`), as rule 4 says. Recommendation: amend the criterion to rule 4.
- **Rule 3's 500 characters are only the column's length.** The service does not check the length (`coach_service.py:300-326`) and no client caps the field, so a longer note is a database error, not a 400. P-PLAYERS still says "holds at most 500 characters". Recommendation: refuse a longer note with a 400 and cap the field.
