---
id: clubs.join-request
status: implemented
depends_on: [clubs.crud, clubs.membership, auth.register, auth.coach-approval]
serves: [P-CLUBS-1]
governed_by: []
---

# clubs.join-request

### Intent
A self-registered coach, once approved by the LevApp admin (`auth.coach-approval`), picks their club
on the onboarding screen: create one, or ask to join an existing one. Asking is a request — any
current coach of that club approves or declines. Approval yields the same membership an accepted
coach invitation does.

### Entities
- **CREATES:** ClubJoinRequest (`club_join_requests`): club_id (FK → clubs, CASCADE), coach_id
  (FK → coaches, CASCADE), status (`pending`|`approved`|`rejected`|`withdrawn`),
  requested_at, decided_at, decided_by_coach_id (FK → coaches, SET NULL). Partial unique index
  on (club_id, coach_id) where status = `pending`.
- **READS:** Club, Coach, Association_CoachClub
- **WRITES:** Association_CoachClub (on approval)

### Rules
1. `GET /api/app/clubs/search?q=<term>` requires an **approved coach** (`require_coach()`); it is
   used on the onboarding screen, after approval. `q` is at least 2 characters; matches `clubs.name` case-insensitively (ILIKE `%term%`); at most 20
   results ordered by name; each result is `{id, name, location, logoUrl}` and nothing about
   members.
2. `POST /api/app/club/<club_id>/join-requests` — approved coach (`require_coach()`, so a pending
   coach is 403 `COACH_NOT_APPROVED`). Creates a `pending` request. 409 if the coach is already a
   member of that club or already has a pending request for it. 404 for an unknown club.
3. `GET /api/app/club/<club_id>/join-requests` — members of that club only (403 otherwise,
   `require_coach()` first — never a 500 for a student). Lists pending requests with the
   requester's name and `requestedAt`.
4. `POST /api/app/club-join-requests/<id>/approve` and `.../reject` — a coach who is a member of
   the request's club; 403 otherwise. Approve creates `Association_CoachClub` (no-op if it
   somehow exists) and sets `approved`, `decided_at`, `decided_by_coach_id`. Reject sets
   `rejected`. A request that is not `pending` is 410.
5. `POST /api/app/club-join-requests/<id>/withdraw` — the requesting coach only; sets `withdrawn`.
6. `GET /api/auth/me` exposes `pendingClubJoinRequest` (see `auth.register` rule 9); it is the
   most recent pending request or `null`.
7. An **approved** coach with no club (no `coach_in_club` rows) is shown the **club onboarding**
   screen instead of the dashboard on web and iOS. With no pending request it offers two paths:
   **Create a club** (name, optional location → `POST /api/app/club`, `clubs.crud`, then the
   dashboard) and **Join an existing club** (search by name via rule 1, pick one → rule 2). With
   a pending request it shows the club name, "waiting for approval", Withdraw, and "Create my
   own club instead". Approval of a still-pending request later adds a second club as normal.
8. Club-scoped coach endpoints called by a coach with no club respond **409**
   `{"error": "NO_CLUB"}`, never 500. At minimum: `POST /add_player`, `POST /incomplete_player`,
   `GET /players`, `POST /coach/join-token`, and the lesson-creation routes.
9. Settings → Club (coach-only, `settings.role-scope` rule 3) lists pending join requests with
   Approve / Decline, and shows a count badge on the section when there are any. Web and iOS.

### Acceptance Criteria

#### CLUBS-JOIN-REQUEST-1: Clubs are searchable by name without revealing members
- **Given** clubs `Padel Academy` (Lisbon) and `Padel Norte` (Porto) and approved coach `rui` with no club
- **When** `rui` GETs `/api/app/clubs/search?q=padel`
- **Then** both clubs are returned with `id`, `name`, `location`, `logoUrl`
- **And** no coach or player information is present in the payload
- **And** an unauthenticated visitor, a student, and a pending coach each get 401/403

#### CLUBS-JOIN-REQUEST-2: Coach requests to join and a member approves
- **Given** coach `rui` with no clubs and coach `maria` who is a member of club 1
- **When** `rui` POSTs `/api/app/club/1/join-requests`
- **Then** a `club_join_requests` row exists with status `pending`
- **When** `maria` POSTs `/api/app/club-join-requests/<id>/approve`
- **Then** the request is `approved` with `decided_by_coach_id = maria.coach.id`
- **And** a `coach_in_club` row links `rui` to club 1
- **And** `rui`'s `GET /api/auth/me` returns `clubs: [{"id": 1, ...}]` and `pendingClubJoinRequest: null`

#### CLUBS-JOIN-REQUEST-3: Rejecting leaves no membership
- **Given** a pending request from `rui` for club 1
- **When** a member of club 1 POSTs `.../reject`
- **Then** the request is `rejected` and no `coach_in_club` row exists for `rui`

#### CLUBS-JOIN-REQUEST-4: Non-member cannot decide
- **Given** a pending request for club 1 and coach `joao` who is not a member of club 1
- **When** `joao` POSTs `.../approve`
- **Then** the response is 403 and the request is still `pending`

#### CLUBS-JOIN-REQUEST-5: Duplicate pending request is rejected
- **Given** a pending request from `rui` for club 1
- **When** `rui` POSTs `/api/app/club/1/join-requests` again
- **Then** the response is 409 and exactly one pending row exists

#### CLUBS-JOIN-REQUEST-6: A student never reaches the list
- **Given** an authenticated student
- **When** they GET `/api/app/club/1/join-requests`
- **Then** the response is 403, not 500

#### CLUBS-JOIN-REQUEST-7: Coach with no club gets 409, not 500
- **Given** coach `rui` with a pending request and no clubs
- **When** `rui` POSTs `/api/app/add_player` with `{"name": "X"}`
- **Then** the response is 409 with `error: "NO_CLUB"`

#### CLUBS-JOIN-REQUEST-8: Approved coach picks a club on the onboarding screen
- **Given** approved coach `rui` with no club, signed in on the web app
- **When** the app loads
- **Then** the club onboarding screen offers "Create a club" and "Join an existing club"
- **And** searching `padel` under "Join an existing club" and picking `Padel Academy` creates a pending request and the screen now shows "Padel Academy — waiting for approval" with Withdraw and "Create my own club instead"
- **And** choosing "Create my own club instead" with name `Rui Padel` lands on the dashboard
- **And** the same screen exists on iOS

#### CLUBS-JOIN-REQUEST-9: Members see and decide requests in Settings → Club
- **Given** coach `maria` (member of club 1) and a pending request from `rui`
- **When** `maria` opens Settings → Club on web
- **Then** the request is listed with `rui`'s name and Approve / Decline
- **And** approving removes it from the list
- **And** the same section exists on iOS

#### CLUBS-JOIN-REQUEST-10: Search ignores case and needs two characters (rule 1)
- **Given** clubs `Padel Academy` and `Padel Norte` and an approved coach
- **When** the coach GETs `/api/app/clubs/search` with `q=NORTE`, with `q=p`, and with no `q`
- **Then** the first answers `Padel Norte` alone, and the other two answer 200 with an empty list
test: `backend/padel_app/tests/test_club_join_requests.py` › `test_search_is_case_insensitive_and_needs_two_chars`

#### CLUBS-JOIN-REQUEST-11: A request is refused for a coach who may not ask (rule 2)
- **Given** club `Padel Academy`, its member `maria`, an approved coach `rui`, and a coach whose account is still pending
- **When** each POSTs `/api/app/club/<id>/join-requests`
- **Then** `maria` asking for her own club is 409, `rui` asking for a club id that does not exist is 404, and the pending coach is 403 `COACH_NOT_APPROVED`
test: `backend/padel_app/tests/test_club_join_requests.py` › `test_member_cannot_request_their_own_club_and_unknown_club_is_404` (+1 more)

#### CLUBS-JOIN-REQUEST-12: Only a member lists, only the requester withdraws, and a decided request stays decided (rules 3, 4, 5)
- **Given** a pending request from `rui` for a club where `maria` is a member and `joao` is not
- **When** `joao` GETs the club's join requests, `maria` POSTs `.../withdraw`, `rui` POSTs `.../withdraw`, and then anyone approves or withdraws it again
- **Then** `joao` and `maria` get 403; `rui` gets 200, the request is `withdrawn` and his `/api/auth/me` shows `pendingClubJoinRequest: null`; every later approve or withdraw is 410
- **And** approving a request twice answers 200 then 410 and leaves exactly one `coach_in_club` row
test: `backend/padel_app/tests/test_club_join_requests.py` › `test_non_member_cannot_list_requests` (+2 more)

#### CLUBS-JOIN-REQUEST-13: `/api/auth/me` reports the newest pending request (rule 6)
- **Given** a coach with no club who asked to join `Padel Academy` and then `Padel Norte`
- **When** they GET `/api/auth/me`
- **Then** `pendingClubJoinRequest` names `Padel Norte`
test: `backend/padel_app/tests/test_club_join_requests.py` › `test_me_reports_most_recent_pending_request`

#### CLUBS-JOIN-REQUEST-14: Creating a club keeps the pending request, and a later approval adds a second club (rule 7)
- **Given** a coach with no club and a pending request for `Padel Academy`
- **When** they create their own club, and a member of `Padel Academy` then approves the request
- **Then** after the create, `/api/auth/me` lists the new club alone and still carries the pending request; after the approval it lists both clubs and `pendingClubJoinRequest` is null
test: `backend/padel_app/tests/test_club_join_requests.py` › `test_creating_own_club_while_pending_keeps_request_and_later_approval_adds_second_club`

### Notes
- Decision: `.cortex/atlas/decisions/2026-09-06-open-registration-and-connections.md`, item 2.
- Push + email for a new request and for the decision: `notifications.request-alerts` (PAD-232).
- OPEN: rule 8 lists the minimum set; audit every `current_club()` caller in
  `frontend_api.py` (8 today) when building.
