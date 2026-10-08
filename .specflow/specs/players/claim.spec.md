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
- **CREATES (PAD-528):** PlayerMerge (`player_merges`): the audit row of one merge —
  placeholder_player_id (int, no FK: the row is gone), placeholder_user_id (FK → users, SET
  NULL), target_player_id (FK → players, SET NULL), target_user_id (FK → users, SET NULL),
  requested_by_coach_id (FK → coaches, SET NULL), confirmed_by_user_id (FK → users, SET NULL),
  trigger (`invite_link` | `coach_request`), counts (JSON: the dry-run counters of rule 5j as
  they were executed), created_at. Investigation only; it enables no undo.
- **READS:** User, Player, Coach, PlayerInvitation
- **WRITES (merge):** every table with a FK to `players.id` — Association_CoachPlayer,
  Association_PlayerClub, Association_PlayerLesson, Association_PlayerLessonInstance, Presence,
  PlayerLevelHistory, PlayerInvitation, StandingWaitingListEntry, WaitingListEntry, Vacancy
  (`filled_by_player_id`, `absent_player_id`), NotificationEvent, ReplacementApprovalPrompt —
  and the user-keyed rows of the placeholder User: ConversationParticipant, Message (sender),
  CalendarBlock. **And every table with a FK to `coach_in_player.id`** (B-361, PAD-528):
  EvaluationRecord, EvaluationEntry, CoachPlayerNote (EvaluationShare follows its record). The
  placeholder User is then disabled.

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
4b. **Trigger B by roster pick (PAD-528; numbering unconfirmed).** The exact-username field of
   rule 4 is for a student the coach does not have yet. For the ticket's case — the student is
   already on the coach's roster, having scanned the coach's QR (`players.join-token`) before
   the coach could link them — the same dialog ("Link to existing account") also lists the
   coach's own students: `GET /api/app/player/<player_id>/claim-candidates?search=` returns
   the acting coach's students who are not claimable themselves, as
   `[{playerId, name, levelLabel, sameName}]`, same-name matches first (rule 4c's
   normalisation), then alphabetical, at most 50; a coach without a `coach_in_player`
   relation to `<player_id>` is 403. Choosing one calls the rule-4 endpoint with
   `{"targetPlayerId"}` instead of `{"username"}`; the target must be one of those
   candidates (404 otherwise). Because the target is already on the coach's roster, rule 4d
   makes this the coach's own dedupe: the merge runs in the same call, the student is never
   asked. Web dialog and iOS sheet both carry a search field over the list and keep the
   username field as a second tab.
4c. **The duplicate flag (PAD-528).** The roster rows of `players.list` rules 1–2 carry
   `possibleDuplicateOf: {playerId, name} | null` on every **claimable** row: the coach's
   non-claimable student whose normalised name equals the placeholder's (casefold, accents
   stripped, whitespace collapsed; the first by id when several). Computed for the whole
   page in one query over the coach's roster, like `due` (rule 9 there); never one query per
   row; `null` on non-claimable rows. Both shells show a "Possible duplicate" badge on the
   row, applying rule 4b's exclusions (only an active student account that is not a coach and
   not claimable can be named), and, on the placeholder's page, a one-tap "Merge into {name}" that opens rule 4b's
   dialog with that student preselected and the preview of rule 5j already shown. Nothing
   moves under the finger: the flag changes no order, filter or sort.
4d. **One consent function — the coach's own dedupe needs no accept (owner, 2026-10-08).**
   Whether the student's accept is required is decided in one place,
   `claim_consent_required(coach, placeholder, target) -> bool`. It is `False` when the target
   student is already on the requesting coach's roster: then the coach merges alone — the request
   is created and accepted in the same call and the same commit, with `confirmed_by_user_id` the
   coach's user, and the student gets **no request, no alert and nothing in their inbox**; a
   failed merge leaves no request behind. The owner's words: "it's basically a dedupe from the
   coach's side" — the student connected to the coach, who already held a placeholder for them.
   It is `True` for a student who is not on that coach's roster (rule 4's username request, which
   the student accepts or rejects): a coach never attaches a student who is not already theirs
   (decision 2026-09-06 item 4). Trigger A (the invite link) is the student's own act.
5. **Merge** — one service, `merge_placeholder_player_into(placeholder_player, claimant_user)`,
   one transaction, in this order:
   a. `Association_CoachPlayer`: for each placeholder relation, if the claimant already has a
      relation with that coach, keep the claimant's row but copy `level_id`, `side`, `notes`
      from the placeholder's row where the claimant's are null; otherwise re-point
      `player_id`. `Association_PlayerClub`: re-point, skipping pairs that already exist.
      **The rows that hang off a dropped relation move to the kept one (B-361, PAD-528):**
      `CoachPlayerNote` re-points. An `EvaluationRecord` re-points unless the kept relation
      already has a record for the same (`evaluated_on`, `lesson_instance_id`); then the
      dropped record's ratings join the kept record for categories it has not rated and stay
      as history (`record_id` NULL, as `evaluations.records` keeps a day's earlier scores) for
      categories it has, its `note` is appended to the kept record's note after a blank line,
      its `EvaluationShare` follows unless the kept record is already shared, and the emptied
      record is deleted. Every `EvaluationEntry` ends on the kept relation. No rating and no
      note is ever dropped by a merge. A metadata guard
      (`test_every_coach_relation_fk_is_covered_by_the_merge`) fails when a new FK onto
      `coach_in_player.id` appears that this step does not handle.
   b. `Association_PlayerLesson`, `Association_PlayerLessonInstance`, `WaitingListEntry`:
      re-point, deleting the placeholder's row where the claimant already has the same
      (lesson | instance) row. `StandingWaitingListEntry` (PAD-528 review): one ACTIVE entry
      per (coach, player, scope), where scope is the entry's series (`lesson_id`, PAD-547) or
      coach-wide when it has none; when both hold an active one with the same coach and scope,
      the claimant's stays active and the placeholder's moves over inactive. Inactive entries,
      and active entries of another scope, always move.
   c. `Presence` (unique per instance, R-018): re-point; where both exist for the same
      instance, keep the claimant's row and delete the placeholder's.
   d. `Vacancy.original_player_id` (PAD-528 review): one OPEN vacancy per (occurrence,
      original player); when both left the same occurrence, both spots stay open and the
      placeholder's keeps its spot with `original_player_id` NULL, as deleting the player would.
      `PlayerLevelHistory`, `NotificationEvent`, `Vacancy.filled_by_player_id`,
      `ReplacementApprovalPrompt.*_player_id`, `PlayerInvitation`: re-point (invitations become
      `accepted`).
   e. `ConversationParticipant` rows of the placeholder User: re-point `user_id`; recompute
      `participant_key` (R-017). If a conversation with the resulting key already exists (the
      coach already chatted with the claimant), move the placeholder conversation's messages
      and reactions into the existing conversation and delete the emptied conversation. Keep
      the earlier `last_read_at`. `Message.sender_id`, `CalendarBlock.user_id`: re-point.
      `PushSubscription` (one per user) and `DeviceToken` (unique per user and token): the
      claimant's row is kept and the placeholder's duplicate dropped.
   f. Delete the placeholder Player row; disable the placeholder User the way
      `delete_account_service` does (status `disabled`, name "Merged user", email/phone null,
      username replaced by a fresh placeholder so the original one is free). Never hard-delete
      the User.
   g. The claimant's own `name`, `username`, `email`, `phone` are untouched — the student's
      identity wins; the coach's relation data (level, side, notes) survives.
   h. **Soft references (PAD-528).** Two JSON columns hold player ids without a FK and are
      re-pointed too: `NotificationConfig.excluded_player_ids` of every coach (the id string of
      the placeholder becomes the claimant's, once) and `ClassRequest.invitee_player_ids`
      (same, deduplicated). A merge never leaves a dangling id in a coach's exclusion list.
   i. **The audit row (PAD-528).** The merge writes one `PlayerMerge` row in its own
      transaction, with the counters of rule 5j as executed. It is the only record that the
      placeholder existed; there is no undo, and the apps say so before the confirm.
   k. **Unique keys (PAD-528 review).** Every unique constraint or index on a table the merge
      writes is either handled by a–j or listed as impossible with its reason
      (`MERGE_UNIQUE_KEYS_HANDLED` / `MERGE_UNIQUE_KEYS_IMPOSSIBLE`);
      `test_every_unique_key_the_merge_touches_is_accounted_for` fails on a new one.
   j. **Dry run (PAD-528).** `GET /api/app/player/<player_id>/merge-preview?targetPlayerId=`
      (the requesting coach, 403 otherwise) and `GET /api/app/player-claim-requests/<id>/preview`
      (the target student) return the merge's plan without running it:
      `{moves: {<table>: n}, dropped: {<table>: n}, merged: {<table>: n}}`. The preview runs the
      same code as the merge inside a transaction it rolls back — the counts cannot drift from
      what the merge then does. **Reading rule:** `moves` counts rows that will point at the
      student afterwards and were the placeholder's (attendance marks, enrolments, evaluations,
      notes, messages …). `dropped` counts placeholder rows the merge discards because the
      student already has the same fact for the same occasion — a presence for the same class
      occurrence, an enrolment in the same class, the same waiting-list entry, join request or
      club membership — the student's own row is kept, and nothing the student did is lost; a
      non-zero `dropped` tells the coach the two records overlapped in time, which is normal
      when the student joined by QR while the coach still marked the placeholder. `merged`
      counts evaluation records that join an existing record on the same day (rule 5a) and chat
      threads folded into an existing thread (rule 5e); nothing in `merged` is lost. Both shells
      show the three groups in the student's accept banner/sheet and in the coach's dialog before
      the request is sent, in words ("12 attendances, 3 evaluations and 1 note move to your
      account; 2 attendance marks you already had are kept"), never as raw table names.
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

#### Evaluations and notes survive when the student already has the coach (B-361, PAD-528)
- **Given** student `ana` already on Maria's roster (she scanned Maria's QR), and placeholder `P1`
  on Maria's roster with one evaluation record (one rating, a note) and one strength note
- **When** the merge runs
- **Then** that record, its rating and the strength note exist and point at Maria's relation with
  `ana`, and Maria has exactly one relation with `ana`

#### Two records for the same day merge into the student's (B-361, PAD-528)
- **Given** the same setup, where both `P1` and `ana` have a class-less record on 2026-09-01: `P1`'s
  rates Volley 4 and Smash 5 with note "placeholder note", `ana`'s rates Smash 2 with note "claimant note"
- **When** the merge runs
- **Then** one record exists for (Maria–`ana`, 2026-09-01): Smash 2 is its rating, Volley 4 joined
  it, Smash 5 remains as a history row with no record, its note is "claimant note", a blank line,
  "placeholder note", and `P1`'s record is gone

#### The coach links a placeholder to a student already on the roster (rule 4b, PAD-528)
- **Given** placeholder `P1` ("Ana S.") and student `ana` ("Ana Silva") both on Maria's roster
- **When** Maria GETs `/api/app/player/<P1>/claim-candidates`
- **Then** `ana` is listed with `sameName: false`, and `P1` itself is not
- **When** Maria POSTs `/api/app/player/<P1>/claim-requests` with `{"targetPlayerId": <ana>}`
- **Then** the merge has run in that call (rule 4d): `P1` is gone and the request is `accepted`

#### A pick outside the roster is refused (rule 4b)
- **Given** student `bruno` who is not on Maria's roster
- **When** Maria POSTs `{"targetPlayerId": <bruno>}` for `P1`
- **Then** the response is 404 and no request exists

#### The roster flags the likely duplicate (rule 4c)
- **Given** placeholder "Ana  Silva" (two spaces) and active student "ana silva" on Maria's roster,
  plus placeholder "Rui" with no namesake
- **When** Maria GETs `/api/app/coach_players_paginated`
- **Then** the placeholder's row carries `possibleDuplicateOf: {playerId: <ana>, name: "ana silva"}`,
  "Rui" and the active student carry `null`, and the page took one query for the flags

#### The coach dedupes alone; the student is never asked or warned (rule 4d)
- **Given** placeholder `P1` and student `ana`, both on Maria's roster
- **When** Maria picks `ana` for `P1`
- **Then** the request is `accepted`, the merge has run, and `player_merges` has one row with
  `confirmed_by_user_id` = Maria's user and `trigger` = `coach_request`
- **And** `ana` received no request alert and `GET /api/app/player-claim-requests` lists nothing for her

#### A student who is not on the roster is still asked (rule 4d)
- **Given** placeholder `P1` on Maria's roster and student `zeca`, who is not
- **When** Maria asks for `zeca` by username
- **Then** a `pending` request exists, nothing has merged, and `zeca` got the `claim.received` alert;
  only `zeca`'s accept runs the merge

#### Two active standing entries with one coach (rule 5b, PAD-528 review)
- **Given** `P1` and `ana` each hold an active standing waiting-list entry with Maria
- **When** the merge runs
- **Then** it succeeds, the preview counts 1 in `dropped.standing_waiting_list_entries`, and `ana`
  holds both entries with only her own active

#### Two open vacancies on one class (rule 5d, PAD-528 review)
- **Given** `P1` and `ana` both left Tuesday's 10:00 class, each with an open vacancy
- **When** the merge runs (and its preview first)
- **Then** both succeed, two open vacancies remain on that class, one names `ana` and the other
  names nobody, and the preview counts 1 in `merged.vacancies`

#### A placeholder never absorbs another placeholder (rule 2)
- **Given** placeholders `P1` and `P4` on Maria's roster
- **When** the merge targets `P4`'s user, or Maria picks `P4`
- **Then** the merge is 403 and the pick is 404; both records are unchanged

#### Soft references follow the merge (rule 5h)
- **Given** Maria's `excludedPlayers.playerIds` = [`P1`] and a class request by `ana` inviting `P1`
- **When** the merge runs
- **Then** the list is [`<ana>`] and the invitees are [`<ana>`], each id once

#### The audit row records what moved (rule 5i)
- **Given** `P1` with 3 presences, 1 evaluation record (one rating, one strength note) and 2 enrolments,
  one presence and one enrolment shared with `ana`, who is in no club yet
- **When** `ana` accepts the claim
- **Then** one `player_merges` row exists with `placeholder_player_id` = `P1`, `target_player_id` =
  `ana`, `trigger` = `coach_request`, `confirmed_by_user_id` = `ana`'s user, and `counts` =
  `{moves: {presences: 2, player_in_lesson: 1, player_in_club: 1, evaluation_records: 1,
  evaluation_entries: 1, coach_player_notes: 1, player_claim_requests: 1}, dropped: {presences: 1,
  player_in_lesson: 1}, merged: {coach_in_player: 1}}`

#### The preview counts what the merge then does (rule 5j)
- **Given** the same setup
- **When** `ana` GETs `/api/app/player-claim-requests/<id>/preview`
- **Then** the body equals the `counts` above, `P1` still exists, its 3 presences are still its own and
  `player_merges` is empty
- **And** after the accept, the `player_merges.counts` equal that body

#### The preview is shown before the confirm on both platforms (rule 5j)
- **Given** a pending request for `ana` with the preview above
- **When** she opens the dashboard banner on web or iOS
- **Then** it reads "2 attendances, 1 evaluation, 1 note and 1 class move to your account; 1 attendance
  and 1 class you already had are kept" (its translation), and the accept button is below it

#### A shared evaluation follows its record unless the student's record is shared (rule 5a)
- **Given** `P1` and `ana` both on Maria's roster, each with a class-less record on 2026-09-01 and
  on 2026-09-02; `P1`'s 09-01 record is shared and `ana`'s is not; on 09-02 both are shared
- **When** the merge runs
- **Then** the 09-01 share now points at `ana`'s record, the 09-02 share of `P1` is gone and `ana`'s
  09-02 share is untouched; two shares exist in all

#### Invite page offers linking on both platforms
- **Given** a pending invitation opened in a browser with an existing student session
- **When** the page renders
- **Then** it offers "Link this record to my account" and, on confirm, shows the merged success state
- **And** the same screen exists on iOS (PAD-164's invite screen carries the option)

### Notes
- Decision: `.cortex/atlas/decisions/2026-09-06-open-registration-and-connections.md`, item 4.
- PAD-528 (2026-10-07): rules 4b–4d, 5h–5j and B-361 came from the ticket "merge an inactive
  coach-created profile with the active profile created via QR". The owner decided on 2026-10-08:
  (1) option B — a same-roster target is the coach's own dedupe, merged without asking or warning
  the student (rule 4d); a student not on the roster is still asked; (2) the duplicate flag stays,
  coach-facing only (roster rows and the placeholder's page; students see nothing). Decision 3
  (audit row, no undo) is the coordinator's, final.
- Push + email to the invited account on a request and to the coach on the decision:
  `notifications.request-alerts` (PAD-232).
- Merge tests must cover every FK listed under Entities; when a new `players.id` **or
  `coach_in_player.id`** FK is added elsewhere, this spec's rule 5 and its tests are the place
  that has to change. B-361 is what happened when the second kind was forgotten.
- OPEN: whether a placeholder that has *two* coaches (a second coach imported the same person)
  should be claimable in one go — v1: yes, all relations move.
