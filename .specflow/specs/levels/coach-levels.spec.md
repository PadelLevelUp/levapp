---
id: levels.coach-levels
status: implemented
depends_on: [auth.login]
implements: ../../specs-business/levels/coach-relies-on-levels.business.md
governed_by: []
---

# levels.coach-levels


### Intent
Each coach defines their own skill level hierarchy (e.g., Beginner, Intermediate, Advanced) used to categorize players and match them to appropriate classes.

### Entities
- **CoachLevel** (`coach_levels`): coach_id, label (e.g., "Beginner"), code (e.g., "B1"), display_order (int)

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

#### Ordering convention is explained in the settings UI
- **Given** an authenticated coach on Settings → Coach Levels
- **When** the levels list is displayed
- **Then** helper text near the list states that the first (top) level is the highest skill level
  and the last is the lowest
