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
4. **Frontend route `/players/:playerId`, as master–detail (PAD-410; the owner's screenshot
   `docs/reference/2026-09-22-players-page-master-detail.png`).**
   - **Web, ≥ 768px:** `/players` and `/players/:playerId` are ONE two-pane page. The roster
     (`players.list`) is on the left with every control it has on its own. The selected player
     is on the right; with no id, the right pane holds a placeholder ("Escolhe um jogador",
     `player-detail-placeholder`). The id stays in the URL, so a profile is deep-linkable, and
     choosing another row swaps the right pane without reloading the list.
   - **Web, < 768px:** the list and the profile are separate full-width views (the messages
     pattern), and the profile has a back control to `/players`.
   - **Profile content, both shells, in this order:**
     - header: initials avatar, name, level chip and side chip, **Editar** at the top right.
       For a player with no account yet, the register-link and claim controls stay in the
       header below the name, where they were: the screenshot shows no such player, so their
       place is unchanged;
     - action row: Ver presenças · Ver faltas · Adicionar a aulas · Lista de espera ·
       **Avaliações** (primary) · **Desassociar** (destructive, last);
     - cards: Avaliação, Informação, Pontos fortes e fracos.
   - Every existing control, test id, accessible name and i18n key is kept; this is a layout
     change, not a feature cut. `/players/:playerId/attendance` and `/absences` stay full
     pages.
   - **iOS is phone-only** (`app.json`: `supportsTablet: false`, portrait): the list pushes the
     profile screen, which is master–detail on a narrow screen. Only the content and order above
     apply there.
   - Nothing moves under the finger: a row click never shifts the list, and an action never
     reflows while its own request is pending.
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

#### The profile opens beside the roster on a wide screen (PAD-410)
- **Given** a coach on a 1280px-wide browser with players "João Silva" and "Pedro Costa"
- **When** they open `/players`, type "S" in the search, and click João's row
- **Then** the URL is `/players/<João's id>`, João's row is marked as selected, and his profile
  (header, action row, cards) shows on the right
- **And** clicking Pedro's row changes the URL and the right pane to Pedro, un-marks João's row,
  and the search box still holds "S"

#### The profile is a separate view on a narrow screen (PAD-410)
- **Given** the same coach on a 390px-wide browser
- **When** they open `/players/<João's id>`
- **Then** only the profile shows, with a back control to `/players`, and the roster is hidden

#### The profile's action row has the screenshot's order on both shells (PAD-410)
- **Given** a coach viewing a player's profile on web or on iOS
- **Then** the actions read, in order, Ver presenças, Ver faltas, Adicionar a aulas, Lista de
  espera, Avaliações, Desassociar, and Desassociar is styled as destructive

