---
id: players.profile
status: implemented
depends_on: [players.create, evaluations.entries, players.notes]
implements: ../../specs-business/players/coach-browses-and-reviews-roster.business.md
governed_by: []
---

# players.profile


### Intent
View a full player profile including evaluations, strengths, weaknesses, and level history.

### Rules
1. `GET /api/app/player_profile/{playerId}` returns full profile
2. Includes: player info, current level, evaluation scores (latest per category), strengths, weaknesses
3. Coach-specific: returns data from the coach's perspective (their notes, their evaluations)
4. Frontend route: `/players/:playerId`
5. The profile offers an "Add to classes" action that opens a week-by-week picker of the coach's
   class instances, backed by `GET /api/app/lesson_instances?from=&to=`. Every non-cancelled
   instance in the selected week is listed; instances already at capacity are shown but not
   selectable. The picker is **not** filtered by the player's level — a coach may add any player
   to any class
6. Client calls to `/api/app/lesson_instances` must use the HTTP verb the route exposes (`GET`).
   A verb mismatch fails the request and renders as an empty picker with no error surfaced
7. `GET /api/app/player_profile/{playerId}` is **coach-only**: it resolves the acting coach with
   `require_coach()` and returns **403** to a caller with no coach profile, before any query runs.
   A 500 is a violation of this rule. (Cross-coach ownership on this route is unchanged and remains
   as PAD-92 left it; this rule is only about the caller's *role*.)

### Acceptance Criteria

#### Player profile rejects a student with 403
- **Given** an authenticated user with a player profile and no coach profile
- **When** they GET `/api/app/player_profile/{anyId}`
- **Then** the response status is exactly 403, and no 500 is produced

#### Get player profile
- **Given** a player with id 5 who has 3 evaluation categories scored and 2 strengths noted
- **When** GET `/api/app/player_profile/5`
- **Then** the response includes player info, current evaluations (latest per category), strengths list, weaknesses list

#### "Add to classes" lists this week's classes
- **Given** a coach with a class scheduled this week that has free spots
- **And** a player on that coach's roster
- **When** the coach opens the player's profile and triggers "Add to classes"
- **Then** the dialog lists that class for its weekday
- **And** selecting it and confirming enrols the player in that class instance
