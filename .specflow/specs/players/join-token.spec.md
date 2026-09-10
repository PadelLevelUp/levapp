---
id: players.join-token
status: implementing
depends_on: [players.create, clubs.membership, auth.register, auth.login]
implements: ../../specs-business/players/coach-builds-roster.business.md
governed_by: []
---

# players.join-token

### Intent
A coach shows a QR code (or shares the same link) and any student with an account joins the
coach's roster by scanning it. The token is coach-scoped, reusable and rotatable, so one code
serves a whole class and a leaked one can be retired. This is the student-initiated half of what
`players.add-existing` intended, and it needs no coach approval: the coach produced the code.

### Entities
- **CREATES:** CoachJoinToken (`coach_join_tokens`): coach_id (FK → coaches, CASCADE), club_id
  (FK → clubs, CASCADE), token_hash (unique, indexed: the SHA-256 hex of a `secrets.token_urlsafe(32)` token; the token
  itself is never stored, PAD-269), expires_at,
  is_active (bool), uses (int, default 0), created_at
- **READS:** Coach, Club, User, Player
- **WRITES:** Association_CoachPlayer, Association_PlayerClub

### Rules
1. `POST /api/app/coach/join-token` — `require_coach()`. Deactivates the coach's current active
   token (if any) and creates a new one bound to the coach and their `current_club`, expiring
   in 7 days. Returns `{token, url, expiresAt, clubName}`, the only response that ever carries the
   token. A coach with no club is 409 `NO_CLUB`.
2. `GET /api/app/coach/join-token` — the coach's active, unexpired token as
   `{active: true, expiresAt, clubName, uses}`, or `null`. It carries no token, path or url:
   only the hash is stored (PAD-269), so a code can be shown only when it is minted.
3. `url` is `<web origin>/join/coach/<token>`. PAD-184's universal links route
   `/join/coach/:token` into the iOS app; the web page is the fallback.
4. `GET /api/app/join-tokens/<token>` is public: `{coachName, clubName, clubLogoUrl}` — enough for
   the student to see who they are joining. 404 unknown; 410 inactive or expired (an expired
   token is flipped to `is_active=false` on read, as invitations do).
5. `POST /api/app/join-tokens/<token>/accept` — `@jwt_required()`. The acting user comes from
   the JWT, never from the body. The user must have a Player row and no Coach row; a coach
   account is 403. Creates `Association_CoachPlayer(coach_id, player_id)` with level/side/notes
   null and `Association_PlayerClub(player_id, token.club_id)`, each only if missing. Increments
   `uses`. Returns 200 `{joined: true, alreadyMember: <bool>, coachName, clubName}` —
   idempotent.
6. Rotation is the only revocation: a new `POST` retires the previous token (410 from then on).
   A token is never deleted, so `uses` stays auditable.
7. Coach UI — Players tab → "Add by QR" (web: dialog; iOS: sheet). Shows the QR (rendered
   client-side from `url`, no server image), the URL as copyable text, the expiry, a Share
   button on iOS, and "Generate new code" (rotate) with a confirm that the old one stops
   working. With no live code the sheet mints one on open. With a live one (rule 2) it shows
   when that code expires and how many students joined, and **Generate new code** to show a
   fresh QR, saying that the current code stops working (PAD-269). Web and iOS.
8. Student UI — "Connect with a coach" screen: reached after student signup (`auth.register`
   rule 11), from the dashboard when the student has no coach, and from Settings → Account. "Has
   no coach" means `GET /api/auth/me` returns `coaches: []` — never inferred from an empty
   calendar (a connected student with no classes this week was shown "Not connected to a coach
   yet?", TestFlight 2026-09-07). It explains "scan your coach's QR with your camera, or paste the link here" and
   accepts a pasted `/join/coach/<token>` URL. Web and iOS.
9. Join page (`/join/coach/:token`): signed in as a student → preview (rule 4) with "Join
   {coachName} at {clubName}" → accept (rule 5) → success state linking to the calendar. Not
   signed in → the token is remembered, the visitor is sent to `/auth` (with "Create account"
   and "Sign in"), and returned to the join page afterwards. Signed in as a coach → the page
   explains coaches cannot join a roster.
10. No in-app QR scanner in v1: the phone camera opens the universal link. Adding a scanner
    needs a camera-permission string and App Store metadata — deferred.
11. A player who joined this way appears in `players.list` with `validated: true`,
    `isActive: true` and no level; the `missing_level` filter (`players.list` rule 5) is how
    the coach finds them to set one. No new roster UI.

### Acceptance Criteria

#### Coach mints a token bound to their current club
- **Given** an authenticated coach whose current club is `Padel Academy`
- **When** they POST `/api/app/coach/join-token`
- **Then** a `coach_join_tokens` row exists with `is_active=true`, `club_id` = Padel Academy, `expires_at` ≈ now + 7 days
- **And** the response `url` ends with `/join/coach/<token>` and `clubName` is `Padel Academy`

#### Rotating retires the previous token
- **Given** an active token `T1` for a coach
- **When** the coach POSTs `/api/app/coach/join-token` again, receiving `T2`
- **Then** `GET /api/app/join-tokens/T1` is 410 and `GET /api/app/join-tokens/T2` is 200

#### Preview is public and reveals only coach and club
- **Given** an active token for coach `Maria` at `Padel Academy`
- **When** an unauthenticated visitor GETs `/api/app/join-tokens/<token>`
- **Then** the response is 200 with `coachName: "Maria"` and `clubName: "Padel Academy"`
- **And** no player, email or roster information is in the payload

#### Student joins the roster and the club
- **Given** an active token for coach `Maria` (club 1) and student `ana` with a Player and no relation to Maria
- **When** `ana` POSTs `/api/app/join-tokens/<token>/accept`
- **Then** a `coach_in_player` row (coach Maria, player ana, level null) and a `player_in_club` row (ana, club 1) exist
- **And** the response is `{joined: true, alreadyMember: false}` and the token's `uses` is 1

#### Accept is idempotent
- **Given** `ana` already on Maria's roster
- **When** `ana` POSTs accept again
- **Then** the response is 200 with `alreadyMember: true` and exactly one `coach_in_player` row exists for the pair

#### A coach account cannot join a roster
- **Given** an authenticated coach
- **When** they POST `/api/app/join-tokens/<token>/accept`
- **Then** the response is 403 and no association is created

#### Expired token is 410
- **Given** a token whose `expires_at` is in the past
- **When** anyone GETs or POSTs accept on it
- **Then** the response is 410 and the row now has `is_active=false`

#### Acting player comes from the JWT only
- **Given** student `ana` authenticated and student `bruno` existing
- **When** `ana` POSTs accept with body `{"playerId": <bruno's id>}`
- **Then** the association created is for `ana`, not `bruno`

#### Unauthenticated scan round-trips through signup
- **Given** a visitor with no session opening `/join/coach/<token>` on the web
- **When** they choose "Create account", register as a student and submit
- **Then** they land back on `/join/coach/<token>` showing "Join Maria at Padel Academy"
- **And** confirming shows the success state and the coach's roster now lists them

#### Connected student is not prompted to connect
- **Given** student `ana` on coach Maria's roster with no classes in the next 7 days
- **When** `ana` opens the dashboard on web and on iOS
- **Then** no "Not connected to a coach yet?" prompt is shown
- **And** a student with `coaches: []` does see it

#### Coach sees the QR on both platforms
- **Given** an authenticated coach on the Players tab with no live code
- **When** they open "Add by QR"
- **Then** a QR code, the same link as text, the expiry and "Generate new code" are shown
- **And** the same sheet exists on iOS with a Share action

#### The token is stored only as a hash (PAD-269)
- **Given** a coach who mints a code and receives token `T`
- **Then** the row's `token_hash` is the SHA-256 hex of `T` and no column holds `T`
- **And** `GET /api/app/coach/join-token` answers `{active: true, expiresAt, clubName, uses}` with no `token`, `path` or `url`
- **And** `GET /api/app/join-tokens/T` is still 200

#### Reopening Add by QR offers a new code (PAD-269)
- **Given** a coach with a live code minted earlier
- **When** they open "Add by QR" on web or iOS
- **Then** the sheet shows the code's expiry, the number of students who joined and "Generate new code"
- **And** generating shows a new QR, and the earlier code is 410 from then on

### Notes
- Decision: `.cortex/atlas/decisions/2026-09-06-open-registration-and-connections.md`, item 3;
  design lifted from PAD-127's proposal.
- QR rendering libraries: web `qrcode.react` (or `qrcode` + canvas), iOS `react-native-qrcode-svg`.
  Both render from the URL string; nothing is stored server-side beyond the token's hash.
- OPEN: tell the coach when someone joins (system message)? v1: no.
