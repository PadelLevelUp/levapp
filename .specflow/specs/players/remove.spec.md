---
id: players.remove
status: implemented
depends_on: [players.create]
implements: ../../specs-business/players/coach-edits-player-details.business.md
governed_by: []
---

# players.remove


### Intent
Take a player off a coach's roster. A coach disconnects from a student who has an account and never
deletes them. A coach may delete only a placeholder: a record that never activated and has no password.

### Entities
- **READS:** Player, User, Association_CoachPlayer, CoachPlayerNote, EvaluationEntry, Presence
- **WRITES:** Association_CoachPlayer (removes this coach's link), CoachPlayerNote and EvaluationEntry
  (this coach's own, through the link), Player and User (a placeholder only)
- **CREATES:** DeletionAudit — one row per removal (PAD-274)

### Rules
1. `POST /api/app/remove_player` with `{coachId, playerId, action}`, where `action` is `disconnect` or
   `delete`. Only the coach whose roster holds the player may call it (403 otherwise, PAD-92).
2. **Disconnect** removes the `coach_in_player` association, and with it this coach's own notes and
   evaluations of the player.
3. Disconnect never deletes the User or Player records, and never touches the player's presences,
   level history or links to other coaches.
4. A coach can never delete a player who has an account. A `delete` of any player who is not a
   placeholder is refused with 409 and `code` `PLAYER_HAS_ACCOUNT`, and nothing changes. There is no
   "only coach" exception (B-057).
5. A **placeholder** is a player who never activated and has no password (`status` `inactive` and a
   null `password`), whatever the username. A coach-created record with a hand-picked username from
   before PAD-105 is one too. An inactive user with a password, and any active or disabled user, has
   an account. A `delete` of a placeholder removes the Player, then the User (PAD-260 rule 3), and
   their presences with them. If another coach also has the placeholder, the delete is refused with
   409 and `code` `PLAYER_HAS_OTHER_COACHES`. The roster payload's `deletable` says, per player,
   whether this coach may delete the record, and the web and iOS apps choose Delete or Disconnect
   from it.
6. With no `action` (every client before PAD-274), a placeholder with no other coach is deleted and
   everyone else is disconnected, so an old client can never delete an account. An unknown `action`
   is 400 with `code` `INVALID_ACTION`.
7. `GET /api/app/player/{id}/removal_impact` returns `{action, notes, evaluations}`, plus `presences`
   when `action` is `delete`: the removal this coach gets and what it takes with it. The web and iOS
   confirmations show those counts. The action says "Disconnect" for a student with an account and
   "Delete" only for a placeholder.
8. Every removal writes one `deletion_audit` row in the same transaction: `entity` `player`, `action`
   `disconnected` or `deleted`, the acting coach's user, the player's name as `label`, and the counts.

### Acceptance Criteria

#### Disconnect keeps the student's record and history
- **Given** coach Ana and her only-coach student Rui, who has an account, one presence, one level-history
  row, one note and one score from Ana
- **When** Ana POSTs `/api/app/remove_player` with `{"coachId": <Ana>, "playerId": <Rui>, "action": "disconnect"}`
  (or with no `action`)
- **Then** Ana's `coach_in_player` row, her note and her score are gone
- **And** Rui's Player, User, presence and level history still exist
- **And** one `deletion_audit` row records `disconnected` by Ana's user with the label "Rui Student"

#### A student with an account is never deleted
- **Given** the same Rui
- **When** Ana POSTs `/api/app/remove_player` with `"action": "delete"`
- **Then** the response is 409 with `code` `PLAYER_HAS_ACCOUNT`
- **And** nothing changed: the link, note, score, Player and User remain, and no audit row is written

#### A placeholder the coach created is deleted
- **Given** a placeholder "Ghost Placeholder" that Ana created and no one claimed
- **When** Ana POSTs `/api/app/remove_player` with `"action": "delete"` (or with no `action`)
- **Then** its Player and User are deleted, and a `deleted` audit row by Ana names "Ghost Placeholder"

#### A legacy stub is a placeholder
- **Given** "Legacy Stub" on Ana's roster: never activated, no password, the hand-picked username
  `legacy-stub`
- **When** Ana asks for its removal impact, then POSTs `/api/app/remove_player` with `"action": "delete"`
- **Then** the impact's `action` is `delete`, and its Player and User are deleted

#### An inactive user with a password is not a placeholder
- **Given** "Half Registered" on Ana's roster: never activated, but with a password
- **When** Ana asks to delete them
- **Then** the response is 409 with `code` `PLAYER_HAS_ACCOUNT`, and the Player remains

#### The roster says which records can be deleted
- **Given** Ana's roster holds Rui (active), a fresh placeholder, "Legacy Stub", "Half Registered" and a
  disabled "Deleted user"
- **When** Ana GETs `/api/app/coach_players`
- **Then** `deletable` is true for the placeholder and "Legacy Stub", and false for the other three

#### A shared placeholder is not deleted
- **Given** the placeholder is also on coach Bea's roster
- **When** Ana asks to delete it
- **Then** the response is 409 with `code` `PLAYER_HAS_OTHER_COACHES`, and the Player remains

#### The impact names the action and what goes
- **Given** Rui as above, and a fresh placeholder
- **When** Ana GETs `/api/app/player/<Rui>/removal_impact` and `/api/app/player/<placeholder>/removal_impact`
- **Then** they answer `{"action": "disconnect", "notes": 1, "evaluations": 1}` and
  `{"action": "delete", "notes": 0, "evaluations": 0, "presences": 0}`
- **And** coach Bea asking about Rui gets 403

### Notes
- B-057 (PAD-274): before this, an active student removed by their only coach had their Player record
  deleted, and their presences and level history with it. That broke rule 3.
- Tests: `backend/padel_app/tests/test_pad274_deletes.py`, and the Playwright spec
  `frontend/apps/web/e2e/players/player-removal.spec.ts`.
