---
id: auth.register
status: implemented
depends_on: [auth.login]
implements: ../../specs-business/auth/newcomer-signs-up-on-their-own.business.md
governed_by: []
---

# auth.register

### Status correction (2026-09-06, B-023)
This leaf read `status: implemented` and described `POST /api/auth/register` creating an
`inactive` user. **No such JSON route ever existed** — `padel_app/modules/api_auth.py` has
login/logout/me only, and the only `/register` is the legacy server-rendered template in
`padel_app/modules/auth.py`. The leaf is rewritten below as the self-service signup decided on
2026-09-06 and is `draft` until built. Activation of accounts created by someone else is
unchanged and lives in `auth.activate`.

### Intent
Anyone creates their own LevApp account — as a coach or as a student — from the login screen on
web and iOS, with no invite. A student's account is usable immediately. A coach's account exists
immediately but is **pending LevApp admin approval** (`auth.coach-approval`); the club step —
create one, or ask to join an existing one — happens right after approval (`clubs.join-request`).

### Entities
- **READS:** User (uniqueness), Club (join path)
- **WRITES:** User (`status=active`, password hash, email), Player (student path), Coach
  (`approval_status=pending`, coach path), CoachLevel (default ladder, coach path)

### Rules
1. `POST /api/auth/register` is public. Body: `role` (`coach`|`student`), `name`, `username`,
   `email`, `password`. No club field: a coach chooses or creates a club only after approval
   (rule 7). An unknown key is ignored.
2. `username` and `email` must each be unique across `users` (email compared case-insensitively
   and stored lowercased). A taken value is 409 with `{"error": "...", "field": "username"|"email"}`.
3. `email` is required at self-signup (recovery and parental consent depend on it). It stays
   optional for coach-created players (`players.create` rule 7 unchanged).
4. A chosen `username` may not start with the placeholder prefix `pending-`
   (`username_tools.PLACEHOLDER_USERNAME_PREFIX`); 400. It must be 3–80 chars of
   `[A-Za-z0-9._-]`. `password` must be at least 8 characters.
5. The User is created with `status=active` — the owner set the password themselves. The
   inactive→activate step (`auth.activate`) is only for accounts created on someone's behalf.
6. `role=student` creates User + Player, no coach, no club. `role=coach` creates User + Coach with
   `approval_status=pending` and the default level ladder (same helper the coach-invitation
   accept path uses, `create_default_levels_for_coach`).
7. A coach has **no club at signup**. Once a LevApp admin approves them (`auth.coach-approval`),
   their next app load shows the club onboarding screen (`clubs.join-request` rule 7): create a
   club, or search existing clubs and request to join one. Until approved, a coach cannot create
   a club, request to join one, or reach any club-scoped endpoint (403 `COACH_NOT_APPROVED`).
8. The response is 201 with `{"accessToken", "user": {id, name, role}}` — the same shape as
   `auth.login` — so the client is signed in without a second request.
9. `GET /api/auth/me` gains `coachApproval: "pending"|"approved"|"rejected"|null` (null for
   students), `clubs: [{id, name}]`, `pendingClubJoinRequest: {id, clubId, clubName} | null`
   and, for a student, `coaches: [{id, name}]` (their `coach_in_player` coaches; `[]` for a
   coach) so clients can route a coach to the pending-approval, club-onboarding or dashboard
   state and know whether a student is connected to a coach without guessing from the calendar.
10. Entry points: the web `/auth` page and the iOS login screen both show "Create account"
    (R-024, web and iOS ship together). Web route `/signup`; iOS route `signup`. The form links
    Privacy Policy and Terms. **Every rejection names the field**: client-side validation shows
    its message under the offending input, every server 400/409 carries `field` and is shown
    under that input, and a rejection with no field shows the server's message verbatim — never
    a generic "check your data" alone (TestFlight feedback 2026-09-07).
11. After signup: a student lands on the "Connect with a coach" screen (`players.join-token`
    rule 8); a coach lands on the **pending-approval** screen (`auth.coach-approval` rule 6).
    On every later app load the coach is routed by `coachApproval` then `clubs`: pending →
    pending-approval screen; rejected → rejected screen; approved with no club → club
    onboarding (`clubs.join-request` rule 7); approved with a club → dashboard.
12. The whole registration is one DB transaction: a failure after the User insert leaves no
    orphan User, Coach or Player.
13. Signup notifies the LevApp admin that a coach is waiting (`auth.coach-approval` rule 4).
14. Signup marks the email as needing verification and sends the first 6-digit code inside the
    same request, best-effort (`auth.email-verification` rules 1 and 6). The 201 body's `user`
    carries `emailVerification: "pending"` (or `"verified"` when the gate is off), and the
    client shows the **Verify your email** screen before any of the destinations in rule 11.
15. **Per-IP throttle (PAD-228).** `POST /api/auth/register` is throttled per client IP by `padel_app/utils/rate_limit.py`: at most N requests per window per IP, N/window from the config knob `AUTH_RATE_LIMIT_REGISTER` (`"count/seconds"`, default `5/600`; `"0"` or `AUTH_RATE_LIMIT_ENABLED=0` switches it off, which the E2E backends do). A request over the limit is 429 `{"error": "RATE_LIMITED", "retryAfterSeconds": n}` with a `Retry-After` header and is not processed. The window slides; successful and failed requests count alike. The IP is the first `X-Forwarded-For` entry when present (Cloud Run sits behind a load balancer), else `remote_addr`. The store is in-process (prod runs one gunicorn worker); a restart empties it. The limit exists so the route cannot be used to mass-create accounts or flood the admin approval queue.

### Acceptance Criteria

#### Student signs up and is signed in
- **Given** no user with username `ana` or email `ana@example.com`
- **When** POST `/api/auth/register` with `{"role": "student", "name": "Ana Silva", "username": "ana", "email": "ana@example.com", "password": "Segura123"}`
- **Then** the response is 201 with an `accessToken`
- **And** a User `ana` exists with `status=active`, a bcrypt password hash and email `ana@example.com`
- **And** a Player row points at that User; no Coach, no `coach_in_player`, no `player_in_club` rows exist for it

#### Coach signs up and is pending approval
- **Given** no user with username `rui`
- **When** POST `/api/auth/register` with `{"role": "coach", "name": "Rui Costa", "username": "rui", "email": "rui@example.com", "password": "Segura123"}`
- **Then** the response is 201 with an `accessToken`
- **And** a Coach row exists with `approval_status = pending`, no `coach_in_club` row and no Club created
- **And** the coach has the default level ladder
- **And** `GET /api/auth/me` returns `coachApproval: "pending"`, `clubs: []`, `pendingClubJoinRequest: null`

#### A club key at signup is ignored
- **Given** a valid coach payload that also carries `club: {"create": {"name": "Padel Norte"}}`
- **When** POST `/api/auth/register`
- **Then** the response is 201 and no Club row named `Padel Norte` exists

#### Pending coach cannot reach club-scoped endpoints
- **Given** coach `rui` with `approval_status = pending`
- **When** `rui` POSTs `/api/app/club` with `{"name": "Rui Padel"}`, or `/api/app/add_player`, or `/api/app/club/1/join-requests`
- **Then** each response is 403 with `error: "COACH_NOT_APPROVED"` and nothing is written

#### Every rejection names the field on iOS
- **Given** the iOS sign-up form filled with username `a` (too short) and an already-taken email
- **When** the user submits
- **Then** the username input shows the length message under it before any request is sent
- **And** after fixing it and submitting, the email input shows "already in use" under it
- **And** a server rejection without a `field` shows the server's own message, not a generic one

#### Taken username and taken email are 409 with the field named
- **Given** an existing user with username `ana` and email `ana@example.com`
- **When** POST `/api/auth/register` with username `ana` and a fresh email
- **Then** the response is 409 with `field: "username"`
- **And** POSTing with a fresh username and email `ANA@example.com` is 409 with `field: "email"`

#### Placeholder-looking username is rejected
- **When** POST `/api/auth/register` with username `pending-abc123`
- **Then** the response is 400 and no User row was created

#### Signed-in student lands on Connect with a coach
- **Given** a visitor on the web `/auth` page
- **When** they click "Create account", choose Student, fill the form, submit and verify the email code
- **Then** they are signed in and the "Connect with a coach" screen is shown
- **And** the same flow exists on iOS from the login screen

#### New coach lands on the pending-approval screen
- **Given** a visitor on the web `/auth` page
- **When** they click "Create account", choose Coach, fill the form, submit and verify the email code
- **Then** they are signed in and the "Waiting for LevApp approval" screen is shown, with no club form
- **And** signing out and back in shows the same screen while still pending
- **And** the same flow exists on iOS

#### Transaction is atomic
- **Given** a coach payload whose default-ladder creation is made to fail (monkeypatched)
- **When** POST `/api/auth/register`
- **Then** the response is 500 or 400
- **And** no User or Coach row was created

#### Too many signups from one IP are throttled
- **Given** `AUTH_RATE_LIMIT_REGISTER` is `2/600`
- **When** IP `203.0.113.7` POSTs `/api/auth/register` three times with valid, distinct bodies
- **Then** two accounts are created and the third response is 429 `RATE_LIMITED` with `retryAfterSeconds` and `Retry-After`, and no third user exists
- **And** the same body from `203.0.113.8` creates the account

### Notes
- Decision: `.cortex/atlas/decisions/2026-09-06-open-registration-and-connections.md`, items 1–2
  and 7 (admin approval of coaches, added the same day).
- Rate limiting: rule 15 (PAD-228).
- Email verification: `auth.email-verification` (PAD-234), added 2026-09-07.
- PAD-198 will add `birthDate` + `country` to this body and gate activation for minors; leave
  room in the service for a post-create hook rather than branching inside the route.
