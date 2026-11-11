---
id: players.list
status: implemented
depends_on: [players.create]
serves: [P-PLAYERS-1]
governed_by: []
---

# players.list


### Intent
Coaches view their player roster with search, sorting, filtering, and pagination.

### Rules
1. `GET /api/app/coach_players` returns all coach-player pairs for the authenticated coach (with evaluations, notes)
2. `GET /api/app/coach_players_paginated` supports: page, per_page, search, sort_by, sort_dir, missing_level, missing_side, incomplete
3. **(PAD-665) Search follows `players.search`** — the one rule shared by every coach-side player
   search: folding (B-531), word-start and typo tiers, relevance order applied before pagination.
   PAD-516's rule below is its tier 2 and still holds. The fields searched are those of
   `players.search` rule 4 (name, nickname, the e-mail's local part and the phone),
   case-insensitive. **Every typed word must appear in the name, in any order** (PAD-516):
   "pedro sousa" finds "Pedro Mesquita e Sousa". Words are split on
   whitespace and each matches as a substring. Accents, case and punctuation are folded ("joao"
   finds "João"), with one rule on the server (`player_service.name_matches_query`, applied after
   the coach scope and the other filters, before pagination) and in the apps' local pickers
   (`@levelup/config` `nameMatchesQuery`). A blank query matches everyone; a query with text but
   no searchable characters ("%", "_") matches nobody, so a wildcard never lists the roster.
4. Sort options: name-asc, name-desc, level-asc, level-desc. **`level-desc` is "Level High→Low": the
   coach's ladder strongest first** (`levels.coach-levels` rules 3 and 10: lower `display_order` is
   stronger; unordered levels are the weakest; `id` breaks ties); `level-asc` is the reverse. Players
   with no level are last in both (PAD-521).
5. Filters: `missing_level=true` (players without assigned level), `missing_side=true` (players without side preference), `incomplete=true` (no level OR no side — the dashboard's "see all", `dashboard.profile-completeness` rule 3; PAD-486). The three are mutually exclusive on screen; each can arrive in the Players URL
6. Frontend uses 60-second LRU cache for paginated results, invalidated on mutations
7. The roster endpoints — `GET /api/app/players`, `/api/app/coach_players`,
   `/api/app/coach_players_paginated` — are **coach-only**. Each resolves the acting coach with
   `require_coach()` and returns **403** to a caller with no coach profile, before any query runs.
   A **500 is a violation of this rule**, not "access denied by accident": these routes used to
   dereference the nullable `current_coach()` (`coach.id`, and `current_club()` for `/players`) and
   raise an unhandled `AttributeError`. This mirrors `settings.role-scope` rules 6-7, which
   established the same contract for the Settings endpoints.

8. **(PAD-148)** Each player card in the roster grid is a real interactive control, not a
   styled `<div>` with a click handler: it is focusable in DOM order, carries an accessible
   name that names the player, activates with **Enter and Space** as well as a pointer, and
   shows a visible focus ring. This is the same requirement `dashboard.navigation` rule 10 and
   `attendance.history` rule 13 already place on their list rows, and it is generalised by
   compass rule **R-026**. The card is the only route to a player's detail page — evaluations,
   strengths & weaknesses, level/side, notes — so without it that whole branch of the product
   is mouse-only. iOS already satisfies this (`role="button"` + `accessibilityLabel` on the
   `Pressable`); web was the shell that lagged.

9. **(PAD-404) The due marker.** Each row of `GET /api/app/coach_players` and
   `/api/app/coach_players_paginated` carries `due: bool`, computed by the server per
   `evaluations.reminders` rule 3 for the acting coach's frequency, in one query for the whole
   page — never one per row. Both shells render it as a small marker with an accessible label
   on the player card; the list's order, filters and sort options do not change because of it
   (nothing moves under the finger). Coach-only, like the rows themselves. Old App Store builds
   ignore the extra boolean.
10. **(PAD-410) The selected row.** On web at ≥ 768px the roster shares the page with the profile
    (`players.profile` rule 4). The row of the player in the URL is highlighted and carries
    `aria-current="true"`. Choosing another row keeps the list exactly as it was: search text,
    sort, page and filter stay, and nothing reloads under the finger. An edit or a removal made
    in the profile is reflected in the list: the row updates, or it disappears and the URL
    returns to `/players`. Each row shows an initials avatar, the name, a level chip and a side
    chip, and keeps every badge it had (pending registration, the due marker of rule 9). Rows
    stay real controls (rule 8, R-026).

11. A roster row's `validated` is true only once the player's account has a password; an account can be `active` and still not validated.
12. On web, a reload of the roster that fails keeps the rows on screen and says so in a toast, and the answer to an older search never replaces the rows of a newer one.

### Acceptance Criteria

#### PLAYERS-LIST-1: The due marker on the roster (rule 9)
- **Given** coach Ana on `monthly`, today 2026-09-21; Rui's newest record is 2026-08-20, Sara's
  2026-08-23, Tiago has none
- **When** she calls `GET /api/app/coach_players`
- **Then** Rui and Tiago carry `due: true`, Sara `due: false`, in the same order as before
- **And** the number of SQL statements the read issues does not grow with the roster size

#### PLAYERS-LIST-2: Roster endpoints reject a student with 403
- **Given** an authenticated user with a player profile and no coach profile
- **When** they GET `/api/app/players`, `/api/app/coach_players`, or
  `/api/app/coach_players_paginated`
- **Then** each response status is exactly 403
- **And** no 500 is produced

#### PLAYERS-LIST-3: Paginated player list
- **Given** a coach with 30 players
- **When** they GET `/api/app/coach_players_paginated?page=1&per_page=25`
- **Then** 25 players are returned with pagination metadata (total, pages)

#### PLAYERS-LIST-4: Search players
- **Given** a coach with players "Alice", "Bob", "Alice B"
- **When** they GET `/api/app/coach_players_paginated?search=alice`
- **Then** only "Alice" and "Alice B" are returned

#### PLAYERS-LIST-5: Search matches every word in any order (PAD-516)
- **Given** a coach with players "Pedro Mesquita e Sousa", "Sousa Pedrosa" and "Pedro Alves"
- **When** they GET `/api/app/coach_players_paginated?search=pedro sousa`
- **Then** "Pedro Mesquita e Sousa" and "Sousa Pedrosa" are returned and "Pedro Alves" is not
- **And** `search=joao alvares` returns "João Álvares", and a search still paginates (total, pages)

#### PLAYERS-LIST-6: Level High→Low lists the strongest level first (PAD-521)
- **Given** Maria's ladder Competição (`display_order` 1), Avançado (2), Iniciação (3), and players
  Rita (Iniciação), Zé (Competição), Ana (Avançado), Bia (no level)
- **When** she GETs `/api/app/coach_players_paginated?sort_by=level&sort_dir=desc`
- **Then** the order is Zé, Ana, Rita, Bia
- **And** with `sort_dir=asc` it is Rita, Ana, Zé, Bia

#### PLAYERS-LIST-7: Filter by missing level
- **Given** a coach with 3 players, 1 without a level
- **When** they GET `/api/app/coach_players_paginated?missing_level=true`
- **Then** only the player without a level is returned

#### PLAYERS-LIST-8: Player card is reachable and activatable by keyboard
- **Given** a signed-in coach on `/players` with at least one player
- **When** they move focus through the page with `Tab`
- **Then** focus lands on a player card, which exposes an accessible name containing the
  player's name
- **And** pressing `Enter` on the focused card opens that player's detail page
- **And** pressing `Space` on the focused card does the same without scrolling the page

#### PLAYERS-LIST-9: The selected row survives a change of player (PAD-410)
- **Given** a coach on `/players` at ≥ 768px, on page 2 of their roster, sorted by level
- **When** they open one player and then another
- **Then** the second player's row is highlighted with `aria-current="true"`, the first one is not,
  and the list is still page 2 sorted by level
- **And** after they remove the second player from the profile, the URL is `/players` and that
  row is gone from the list

#### PLAYERS-LIST-10: The level sort holds with a search, and a level with no order is the weakest (rules 3, 4)
- **Given** a coach's ladder of three ordered levels and one level with no order, and students at each and one with no level
- **When** the roster is sorted by level, strongest first and weakest first, and searched while sorted
- **Then** strongest first lists the three ordered levels, then the unordered one, then the student with no level
- **And** weakest first starts with the unordered level and still ends with the student with no level
- **And** a search keeps the level order among the students it matches
test: `backend/padel_app/tests/test_pad521_level_order.py` › `test_an_unordered_level_is_the_weakest_in_both_directions` (+1 more)

#### PLAYERS-LIST-11: A query of wildcards or punctuation matches nobody, and a blank type-ahead lists nobody (rule 3)
- **Given** a roster that includes "Ana 100%_ Real"
- **When** the roster is searched with `%`, `_` and `!!`, and the type-ahead with a blank
- **Then** each returns nobody
- **And** `100% real` and `_ ana` each return that one player, and the type-ahead finds "sousa pedro" in any word order
test: `backend/padel_app/tests/test_pad516_any_order_search.py` › `test_a_query_with_no_searchable_characters_matches_nobody` (+2 more)
- Code to follow: add a second name holding the searched letters to the roster fixture of `test_wildcards_stay_literal_in_every_word` in `test_pad516_any_order_search.py`, so it fails when `%` or `_` act as wildcards.

#### PLAYERS-LIST-12: The roster on screen survives a failed or a late answer (rule 12)
- **Given** the web Players page showing two students
- **When** a reload of the roster fails, and two searches answer out of order
- **Then** after the failure the rows are still shown and a toast says the list could not load
- **And** the answer for the older search does not replace the rows of the newer one
test: `frontend/apps/web/src/pages/PlayersPage.masterDetail.test.tsx` › `(h) a roster fetch that fails after a successful page keeps the rows and shows the error toast` (+1 more)

#### PLAYERS-LIST-13: A student is marked validated only once their account has a password (rule 11)
- **Given** an active player whose account has no password
- **When** the roster is read before and after the password is set
- **Then** `validated` is false before and true after
test: `backend/padel_app/tests/test_player_level.py` › `test_validated_reflects_password_completion`
