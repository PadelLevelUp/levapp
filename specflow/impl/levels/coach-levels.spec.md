---
id: levels.coach-levels
status: implemented
depends_on: [auth.login]
serves: [P-LEVELS-1]
governed_by: []
---

# levels.coach-levels


### Intent
Each coach defines their own skill level hierarchy (e.g., Beginner, Intermediate, Advanced) used to categorize players and match them to appropriate classes.

### Entities
- **CoachLevel** (`coach_levels`): coach_id, label (e.g., "Beginner"), code (e.g., "B1"), display_order (int)
- **READS/WRITES on delete (rule 11):** Association_CoachPlayer (`coach_in_player.level_id`),
  Lesson (`default_level_id`), LessonInstance (`level_id`), Vacancy (`level_id`) — all
  `ON DELETE SET NULL`; PlayerLevelHistory (`level_id`, NOT NULL, `ON DELETE CASCADE`)

### Rules
1. Levels are coach-specific — each coach defines their own scale
2. `label` is the display name, `code` is a short identifier
3. `display_order` determines ranking: **lower `display_order` = stronger level**. The notification
   engine treats a level with a *smaller* `display_order` as being "above" (more advanced than) a
   level with a larger one (`_level_ids_one_above` / `all_above_vacancy` in `notification_service`).
4. `display_order` is derived from list position on the settings page (1 = first row), so the
   **first level in the list is the highest skill level and the last is the lowest**.
5. The settings UI must state this ordering convention explicitly so coaches order levels correctly
   (the ordering has no visual cue on its own).
6. CRUD: POST/PATCH/DELETE `/api/app/coach/level/{id}`
7. Bulk upsert via `upsert_coach_levels()` from settings page
8. Levels are used for: class default level, player assignment, notification engine matching
9. `display_order` is **normalised on every write path** (settings upsert, single-level create,
   spreadsheet/AI import) so a coach's levels always carry a contiguous `1..N`. A level created
   without an explicit order is appended to the **end** of the ladder (weakest), never given `0`
   — `0` would otherwise sort ahead of every explicitly ordered level and be read by the
   notification engine as the coach's strongest level.
10. Consumers that need the ladder must read it through the canonical ordering
   (`display_order` ascending, unset/`0` last, `id` ascending as a stable tie-break) rather than
   comparing raw `display_order` integers, so duplicated or sparse values cannot corrupt
   "one level above/below" adjacency (see notifications.invitations rule 4c).
   `GET /api/app/coach_levels` returns the levels in this order (PAD-522): every level picker on
   web and iOS — the player profile editor, the add and edit sheets — lists the strongest first
   and renders the list as received.
11. **Deleting a level unassigns it; it never deletes what held it** (PAD-255, B-035, audit C2).
    `POST /api/app/delete/coach_level` goes through `delete_coach_level_service`, which sets
    `level_id` to `NULL` on the coach's roster rows, lessons, instances and vacancies at that level
    and only then deletes the row. Roster rows keep their side, notes and evaluations. The four
    foreign keys are `ON DELETE SET NULL` in the database as well (migration `0efff0790eb0`), and
    `CoachLevel.coach_player_relations` carries no delete cascade — the ORM cascade that used to be
    there is what deleted players. A level's `player_level_history` rows go with the level (the
    rung no longer exists); the player's current level is the roster row, which survives with
    `NULL`. The same migration makes `coach_invitations.invited_by_coach_id` and
    `player_invitations.invited_by_coach_id` `SET NULL` (audit H7), so a coach who once sent an
    invitation can be deleted.
12. **A coach never holds two levels with the same `code`** (PAD-273, audit M14). The database
    enforces it with the unique index `uq_coach_levels_coach_code` on `(coach_id, code)`. Every write
    path already matches on the code first: the settings upsert (`upsert_coach_levels`) updates the
    existing row and the spreadsheet/AI import skips it. The migration creates the index only when
    no duplicate exists; otherwise it logs a WARNING with the count and leaves the index for a human
    to add after cleaning up.
13. **`display_order` is NOT NULL with a database default of `0`** (PAD-273, audit M12). `0` is the
    "unset" value rules 9 and 10 already describe, so a row written without an order (raw SQL, an
    old client) still sorts last and is renumbered on the next write. It is never `NULL`.
14. **A new coach starts from the reference ladder (PAD-815; owner, 2026-11-02).** The ladder written
    when a coach is created (`create_default_levels_for_coach`, used by every creation path) is the
    reference coach's 17 levels, strongest first: `2+` "Nivel 2 alto", `2` "Nivel 2", `2-` "Nivel 2
    baixo", then the same three for 3, 4, 5 and 6, then `7+` "Nivel 7 alto" and `7` "Iniciação"
    (display_order 1…17). It replaces L1/L2/L3. The labels are the reference's own, as they read
    in its Settings. The helper stays idempotent: a coach who already has levels keeps them.
15. **The delete route refuses an id it cannot use before it looks anything up** (PAD-92, PAD-101).
    `POST /api/app/delete/coach_level` never answers 500 for a bad id: a client's temporary row id is
    a bad request, and an id that names no level is not found.
16. **Every level has a code.** The settings section does not send a row whose code is blank.

### Acceptance Criteria

#### LEVELS-COACH-LEVELS-1: A new coach starts from the reference ladder (rule 14)
- **Given** no coach yet
- **When** a coach is created by sign-up, by accepting a club invitation as a new user, or by
  `create_coach_service`
- **Then** their ladder is rule 14's 17 levels, with those codes, labels and display_order 1…17

#### LEVELS-COACH-LEVELS-2: The levels list comes strongest first, whatever order they were created in (PAD-522)
- **Given** Maria created Iniciação, then Competição, then Avançado, and ordered them in Settings as
  Competição (1), Avançado (2), Iniciação (3)
- **When** she GETs `/api/app/coach_levels`
- **Then** the codes come in the order Competição, Avançado, Iniciação

#### LEVELS-COACH-LEVELS-3: Create level
- **Given** an authenticated coach
- **When** they POST to `/api/app/coach/level` with `{"label": "Beginner", "code": "B1", "display_order": 1}`
- **Then** a CoachLevel record is created

#### LEVELS-COACH-LEVELS-4: Upsert levels
- **Given** a coach with levels [B1, I1]
- **When** they submit levels [B1 (updated label), I1, A1 (new)]
- **Then** B1 is updated, I1 unchanged, A1 is created

#### LEVELS-COACH-LEVELS-5: A level created without an explicit order lands at the bottom of the ladder
- **Given** a coach with levels `4` (display_order 1) and `5` (display_order 2)
- **When** a level `5-` is created through a path that does not supply `display_order`
- **Then** `5-` is stored with display_order 3 (the end of the ladder), not 0
- **And** the coach's ladder reads `4`, `5`, `5-` from strongest to weakest

#### LEVELS-COACH-LEVELS-6: Deleting a level keeps the players who held it
- **Given** coach `maria` with levels `B1` and `A1`, player `rui` at `B1` with one note and one evaluation, and a class, an occurrence and an open vacancy at `B1`
- **When** `maria` POSTs `/api/app/delete/coach_level` `{"id": <B1>}`
- **Then** the response is 200, `B1` is gone and `A1` remains
- **And** `rui`'s roster row still exists with `level_id = NULL`, its side, note and evaluation intact
- **And** the class's `default_level_id`, the occurrence's `level_id` and the vacancy's `level_id` are `NULL`

#### LEVELS-COACH-LEVELS-7: The database agrees with the service
- **Given** the six foreign keys named in rule 11
- **When** the models are inspected
- **Then** each declares `ondelete="SET NULL"` and `CoachLevel.coach_player_relations` has no `delete` cascade
- **And** the migration rewrites exactly those six, each step guarded by the inspector

#### LEVELS-COACH-LEVELS-8: A coach cannot hold two levels with the same code
- **Given** coach `maria` with a level whose code is `B1`
- **When** a second level with code `B1` is written for `maria`
- **Then** the database refuses it (integrity error) and `maria` still has exactly one `B1`
- **And** another coach can still have a level `B1`

#### LEVELS-COACH-LEVELS-9: A level written without an order gets 0, never NULL
- **Given** a raw `INSERT INTO coach_levels (coach_id, label, code)` with no `display_order`
- **When** the row is read back
- **Then** its `display_order` is `0`

#### LEVELS-COACH-LEVELS-10: Ordering convention is explained in the settings UI
- **Given** an authenticated coach on Settings → Coach Levels
- **When** the levels list is displayed
- **Then** helper text near the list states that the first (top) level is the highest skill level
  and the last is the lowest

#### LEVELS-COACH-LEVELS-11: The default ladder is written once (rule 14)
- **Given** a coach who already has the reference ladder
- **When** the default ladder is created for that coach again, inside a transaction or outside one
- **Then** the coach still has exactly the 17 levels, and the call answers those 17
test: `backend/padel_app/tests/test_pad476_registration_is_one_transaction.py` › `test_the_levels_helper_inside_a_unit_returns_its_levels_and_stays_idempotent` (+1 more)

#### LEVELS-COACH-LEVELS-12: Levels sharing a display_order still form a one-step ladder (rule 10)
- **Given** a coach with levels `4` (display_order 1), `5` (display_order 2) and `5-` (display_order 2), created in that order
- **When** the engine asks which level is one above `5`, and which is one above `5-`
- **Then** it gets `4` for `5` and `5` for `5-`: equal orders are ranked by id
test: `backend/padel_app/tests/test_level_ladder_ordering.py` › `test_duplicate_display_orders_do_not_widen_adjacency`

#### LEVELS-COACH-LEVELS-13: Deleting a level with an unusable id is refused, never a server error (rule 15)
- **Given** a coach, and no level with id 999999
- **When** they POST `/api/app/delete/coach_level` with `{"id": "new-1753900000000"}`, with `{}`, or with `{"id": 999999}`
- **Then** the first two answer 400 and the third answers 404
- **And** an anonymous caller gets 401 whatever the id
test: `backend/padel_app/tests/test_delete_nonnumeric_id_guard.py` › `test_delete_coach_level_rejects_nonnumeric_id` (+3 more)

#### LEVELS-COACH-LEVELS-14: A level edit is held until the tab's Save (rule 7; settings.explicit-save rule 2)
- **Given** a coach on Settings → Coach Levels with one stored level
- **When** they remove the row
- **Then** the row leaves the list, nothing is deleted yet and the tab is unsaved
- **When** they press the tab's Save
- **Then** the level is deleted and the tab is clean
- **And** the section has no Save button of its own
test: `frontend/apps/web/src/components/settings/CoachLevelsSection.test.tsx` › `removing a stored row is held: nothing is deleted until the Save, which deletes it` (+1 more)

#### LEVELS-COACH-LEVELS-15: A level row without a code is not sent (rule 16)
- **Given** a coach who emptied a stored level's code
- **When** they press the tab's Save
- **Then** the save fails naming the levels part and `settings.coachLevels.validationErrorDescription`, no level request is sent, and the part stays unsaved
test: `frontend/apps/web/src/components/settings/CoachLevelsSection.test.tsx` › `a row without a code is refused with the reason, nothing is sent, and it stays unsaved (#550 review F2)`
