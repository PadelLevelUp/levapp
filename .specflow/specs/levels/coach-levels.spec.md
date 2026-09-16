---
id: levels.coach-levels
status: implemented
depends_on: [auth.login]
implements: ../../specs-business/levels/coach-defines-and-assigns-skill-ladder.business.md
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

### Acceptance Criteria

#### Create level
- **Given** an authenticated coach
- **When** they POST to `/api/app/coach/level` with `{"label": "Beginner", "code": "B1", "display_order": 1}`
- **Then** a CoachLevel record is created

#### Upsert levels
- **Given** a coach with levels [B1, I1]
- **When** they submit levels [B1 (updated label), I1, A1 (new)]
- **Then** B1 is updated, I1 unchanged, A1 is created

#### A level created without an explicit order lands at the bottom of the ladder
- **Given** a coach with levels `4` (display_order 1) and `5` (display_order 2)
- **When** a level `5-` is created through a path that does not supply `display_order`
- **Then** `5-` is stored with display_order 3 (the end of the ladder), not 0
- **And** the coach's ladder reads `4`, `5`, `5-` from strongest to weakest

#### Deleting a level keeps the players who held it
- **Given** coach `maria` with levels `B1` and `A1`, player `rui` at `B1` with one note and one evaluation, and a class, an occurrence and an open vacancy at `B1`
- **When** `maria` POSTs `/api/app/delete/coach_level` `{"id": <B1>}`
- **Then** the response is 200, `B1` is gone and `A1` remains
- **And** `rui`'s roster row still exists with `level_id = NULL`, its side, note and evaluation intact
- **And** the class's `default_level_id`, the occurrence's `level_id` and the vacancy's `level_id` are `NULL`

#### The database agrees with the service
- **Given** the six foreign keys named in rule 11
- **When** the models are inspected
- **Then** each declares `ondelete="SET NULL"` and `CoachLevel.coach_player_relations` has no `delete` cascade
- **And** the migration rewrites exactly those six, each step guarded by the inspector

#### A coach cannot hold two levels with the same code
- **Given** coach `maria` with a level whose code is `B1`
- **When** a second level with code `B1` is written for `maria`
- **Then** the database refuses it (integrity error) and `maria` still has exactly one `B1`
- **And** another coach can still have a level `B1`

#### A level written without an order gets 0, never NULL
- **Given** a raw `INSERT INTO coach_levels (coach_id, label, code)` with no `display_order`
- **When** the row is read back
- **Then** its `display_order` is `0`

#### Ordering convention is explained in the settings UI
- **Given** an authenticated coach on Settings → Coach Levels
- **When** the levels list is displayed
- **Then** helper text near the list states that the first (top) level is the highest skill level
  and the last is the lowest
