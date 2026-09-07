---
id: players.claim
status: implemented
depends_on: [players.create, players.invite-completion, auth.login, messaging.conversations, attendance.presence]
implements: ../../specs-business/players/coach-builds-roster.business.md
governed_by: []
---

# players.claim

### Intent
A coach created a player record for someone who — before or after — registered their own account.
Instead of two people in the database, the coach's record is folded into the student's real account:
level history, attendance, notes, enrolments and the chat thread move over, and the placeholder
account is retired. Two ways in: the student opens the invite link while signed in, or the coach
asks by exact username and the student accepts.

### Entities
- **CREATES:** PlayerClaimRequest (`player_claim_requests`): player_id (the placeholder Player,
  FK → players, CASCADE), target_user_id (FK → users, CASCADE), requested_by_coach_id (FK →
  coaches, SET NULL), status (`pending`|`accepted`|`rejected`|`revoked`), created_at,
  decided_at. Partial unique on (player_id) where status = `pending`.
- **READS:** User, Player, Coach, PlayerInvitation
- **WRITES (merge):** every table with a FK to `players.id` — Association_CoachPlayer,
  Association_PlayerClub, Association_PlayerLesson, Association_PlayerLessonInstance, Presence,
  PlayerLevelHistory, PlayerInvitation, StandingWaitingListEntry, WaitingListEntry, Vacancy
  (`filled_by_player_id`, `absent_player_id`), NotificationEvent, ReplacementApprovalPrompt —
  and the user-keyed rows of the placeholder User: ConversationParticipant, Message (sender),
  CalendarBlock. The placeholder User is then disabled.

### Rules
1. **Claimable** means: the Player's User has `password IS NULL`, a placeholder username
   (`is_placeholder_username`), and `status = inactive`. A player whose account was ever
   activated is not claimable (409 `ALREADY_ACTIVATED`).
2. **Claimant** must be an active User with a Player row and no Coach row (403 otherwise), and
   must not be the placeholder itself.
3. **Trigger A — invite link while signed in.** The `/invite/player/:token` page shows
   "Already have an account? Sign in to link it". After sign-in the page calls
   `POST /api/app/player-invitations/<token>/claim` (`@jwt_required()`), which validates the
   token exactly as `players.invite-completion` rule 7 does (404/410), runs the merge (rule 5)
   with the caller as claimant, and marks the invitation `accepted`. Response: 200
   `{merged: true, coachName}`.
4. **Trigger B — coach asks by username.** Player detail (a claimable player only) → "Link to
   existing account" → exact username → `POST /api/app/player/<player_id>/claim-requests`
   `{"username"}` by a coach who has a `coach_in_player` relation with that player (403
   otherwise). Exact match only, no search; unknown or non-student username → 404; a pending
   request for this player → 409. The target student sees pending requests via
   `GET /api/app/player-claim-requests` (theirs only), as a dashboard banner and under Settings →
   Account: "{coachName} ({clubName}) wants to link the record '{placeholder name}' to your
   account". `POST /api/app/player-claim-requests/<id>/accept` runs the merge (rule 5) with the
   target as claimant; `.../reject` sets `rejected`. Only the target user may decide (403). The
   requesting coach may `.../revoke` while pending. Non-pending → 410.
5. **Merge** — one service, `merge_placeholder_player_into(placeholder_player, claimant_user)`,
   one transaction, in this order:
   a. `Association_CoachPlayer`: for each placeholder relation, if the claimant already has a
      relation with that coach, keep the claimant's row but copy `level_id`, `side`, `notes`
      from the placeholder's row where the claimant's are null; otherwise re-point
      `player_id`. `Association_PlayerClub`: re-point, skipping pairs that already exist.
   b. `Association_PlayerLesson`, `Association_PlayerLessonInstance`, `WaitingListEntry`,
      `StandingWaitingListEntry`: re-point, deleting the placeholder's row where the claimant
      already has the same (lesson | instance | standing entry) row.
   c. `Presence` (unique per instance, R-018): re-point; where both exist for the same
      instance, keep the claimant's row and delete the placeholder's.
   d. `PlayerLevelHistory`, `NotificationEvent`, `Vacancy.*_player_id`,
      `ReplacementApprovalPrompt.*_player_id`, `PlayerInvitation`: re-point (invitations become
      `accepted`).
   e. `ConversationParticipant` rows of the placeholder User: re-point `user_id`; recompute
      `participant_key` (R-017). If a conversation with the resulting key already exists (the
      coach already chatted with the claimant), move the placeholder conversation's messages
      and reactions into the existing conversation and delete the emptied conversation. Keep
      the earlier `last_read_at`. `Message.sender_id`, `CalendarBlock.user_id`: re-point.
   f. Delete the placeholder Player row; disable the placeholder User the way
      `delete_account_service` does (status `disabled`, name "Merged user", email/phone null,
      username replaced by a fresh placeholder so the original one is free). Never hard-delete
      the User.
   g. The claimant's own `name`, `username`, `email`, `phone` are untouched — the student's
      identity wins; the coach's relation data (level, side, notes) survives.
6. After the merge, every roster, attendance, evaluation and calendar payload that referenced
   the placeholder `playerId` now yields the claimant's `playerId`; clients invalidate their
   caches (the 60-second roster LRU of `players.list` rule 6) on the response.
7. Both triggers and the student-side inbox ship on web and iOS (R-024).

### Acceptance Criteria

#### Claim via invite link keeps the coach's data
- **Given** coach Maria created placeholder player `P1` ("Ana S.", level B1, side left, 3 presences, 2 enrolments) with a pending invitation token
- **And** student `ana` registered on her own (Player `P2`, no relation to Maria)
- **When** `ana`, authenticated, POSTs `/api/app/player-invitations/<token>/claim`
- **Then** `coach_in_player(Maria, P2)` exists with `level_id = B1` and `side = left`
- **And** the 3 presences and 2 enrolments now point at `P2`, and `P1` no longer exists
- **And** the placeholder User is `disabled` with a fresh placeholder username, and `ana`'s name/username are unchanged
- **And** the invitation is `accepted`

#### Chat history follows the claim
- **Given** the same setup, with a conversation between Maria and the placeholder User holding 4 messages
- **When** the claim runs
- **Then** those 4 messages are readable in a conversation between Maria and `ana`
- **And** if Maria and `ana` already had a conversation with 2 messages, one conversation remains with 6 messages and the right `participant_key`

#### Coach-initiated request is accepted by the student
- **Given** placeholder `P1` on Maria's roster and student `ana`
- **When** Maria POSTs `/api/app/player/<P1>/claim-requests` with `{"username": "ana"}`
- **Then** a pending `player_claim_requests` row exists and `ana`'s `GET /api/app/player-claim-requests` lists it with Maria's name and "Ana S."
- **When** `ana` POSTs `.../accept`
- **Then** the merge outcome of the first criterion holds and the request is `accepted`

#### Rejecting changes nothing
- **Given** a pending claim request for `P1` targeting `ana`
- **When** `ana` POSTs `.../reject`
- **Then** `P1`, its User and `ana`'s Player are unchanged and the request is `rejected`

#### Only the target decides
- **Given** a pending claim request targeting `ana`
- **When** student `bruno` POSTs `.../accept`
- **Then** the response is 403 and the request is still `pending`

#### An activated player cannot be claimed
- **Given** player `P3` whose User has a password and status `active`
- **When** a coach POSTs `/api/app/player/<P3>/claim-requests`
- **Then** the response is 409 `ALREADY_ACTIVATED`
- **And** "Link to existing account" is not offered on `P3`'s detail page

#### A coach account cannot claim
- **Given** an authenticated coach opening a pending invitation's claim endpoint
- **When** they POST `/api/app/player-invitations/<token>/claim`
- **Then** the response is 403 and nothing is merged

#### Duplicate presence resolves to the claimant's
- **Given** `P1` and `P2` both have a Presence for lesson instance 10
- **When** the merge runs
- **Then** exactly one Presence exists for (instance 10, `P2`) and it is `P2`'s original row

#### Invite page offers linking on both platforms
- **Given** a pending invitation opened in a browser with an existing student session
- **When** the page renders
- **Then** it offers "Link this record to my account" and, on confirm, shows the merged success state
- **And** the same screen exists on iOS (PAD-164's invite screen carries the option)

### Notes
- Decision: `.cortex/atlas/decisions/2026-09-06-open-registration-and-connections.md`, item 4.
- Merge tests must cover every FK listed under Entities; when a new `players.id` FK is added
  elsewhere, this spec's rule 5 and its tests are the place that has to change.
- OPEN: whether a placeholder that has *two* coaches (a second coach imported the same person)
  should be claimable in one go — v1: yes, all relations move.
