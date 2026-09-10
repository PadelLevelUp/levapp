---
id: players.list
status: implemented
depends_on: [players.create]
implements: ../../specs-business/players/coach-browses-and-reviews-roster.business.md
governed_by: []
---

# players.list


### Intent
Coaches view their player roster with search, sorting, filtering, and pagination.

### Rules
1. `GET /api/app/coach_players` returns all coach-player pairs for the authenticated coach (with evaluations, notes)
2. `GET /api/app/coach_players_paginated` supports: page, per_page, search, sort_by, sort_dir, missing_level, missing_side
3. Search matches against player name (case-insensitive)
4. Sort options: name-asc, name-desc, level-asc, level-desc
5. Filters: `missing_level=true` (players without assigned level), `missing_side=true` (players without side preference)
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

### Acceptance Criteria

#### Roster endpoints reject a student with 403
- **Given** an authenticated user with a player profile and no coach profile
- **When** they GET `/api/app/players`, `/api/app/coach_players`, or
  `/api/app/coach_players_paginated`
- **Then** each response status is exactly 403
- **And** no 500 is produced

#### Paginated player list
- **Given** a coach with 30 players
- **When** they GET `/api/app/coach_players_paginated?page=1&per_page=25`
- **Then** 25 players are returned with pagination metadata (total, pages)

#### Search players
- **Given** a coach with players "Alice", "Bob", "Alice B"
- **When** they GET `/api/app/coach_players_paginated?search=alice`
- **Then** only "Alice" and "Alice B" are returned

#### Filter by missing level
- **Given** a coach with 3 players, 1 without a level
- **When** they GET `/api/app/coach_players_paginated?missing_level=true`
- **Then** only the player without a level is returned

#### Player card is reachable and activatable by keyboard
- **Given** a signed-in coach on `/players` with at least one player
- **When** they move focus through the page with `Tab`
- **Then** focus lands on a player card, which exposes an accessible name containing the
  player's name
- **And** pressing `Enter` on the focused card opens that player's detail page
- **And** pressing `Space` on the focused card does the same without scrolling the page

