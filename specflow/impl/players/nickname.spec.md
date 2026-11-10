---
id: players.nickname
status: draft
depends_on: [players.edit, players.list, players.remove]
serves: [P-PLAYERS-4]
governed_by: []
---

# players.nickname

### Intent
A coach gives a student a nickname that only that coach sees, and can show it in place of the
real name in their own views (PAD-660, approved by the owner 2026-10-14).

### Entities
- **WRITES:** `Association_CoachPlayer` (`coach_in_player`): `nickname` (string ≤ 60, nullable),
  `nickname_as_name` (boolean, default false)
- **READS:** `User.name`, the roster payload, the conversation list payload

### Rules
1. **The nickname lives on the coach–student relation**, never on `User` or `Player`. Each coach
   holds their own; the same student can have a different nickname per coach, or none.
2. **It leaves the server only to its own coach.** The roster rows of `GET /app/coach_players`
   and `coach_players_paginated`, `notify/player_search` and the claim candidates carry
   `nickname`, `nicknameAsName` and `displayName` (the nickname when the switch is on and the
   nickname is not blank, else the real name), read from the REQUESTING coach's own relation row.
   `name` stays the real name on every payload, so an edit form never saves a nickname over it.
   No serializer that a student, or another coach, can receive carries any of the three:
   `serialize_user`, `serialize_player`, `serialize_user_public`, the class detail
   (`serialize_class_instance`, readable by club colleagues) and the student's own payloads.
3. **Coach views resolve the name from the coach's own roster** — never on the server for a shared
   payload. The class detail is readable by every coach of the club (a colleague, the owner), so
   a nickname substituted while serializing it would show coach A's nickname to coach B; the
   requesting coach's own roster is the only source that is right by construction. One helper in `@levelup/config`,
   `coachDisplayName(roster, playerId, fallbackName)`, returns the roster row's `displayName`
   for a player on the coach's roster and the fallback otherwise. The class detail's grouped
   list and pop-up (`calendar.event-detail` rules 22–23), the players list and profile use it.
   The profile and the pop-up show the real name under the nickname, smaller, while the switch
   is on. The conversation list's `participantName` is the viewer coach's display name for a
   student participant, resolved per viewer in `serialize_conversation`.
4. **The student always gets the real name.** Message templates (`{name}`), pushes, and the
   cancellation notice written into the shared coach–student conversation use `User.name`; none
   reads the relation's nickname.
5. **Search finds both.** `coach_players_paginated` and `notify/player_search` match the typed
   words against the real name or the requesting coach's nickname (the shared name-matching rule,
   PAD-665, takes both fields); the apps' local pickers do the same: `searchRoster` and
   `waitingListPickerOptions` pass the row's nickname (`rosterNicknameOf`, `@levelup/config`) as
   the rule's `nickname` field, so a nickname kept off the name still finds the student.
6. **Setting it.** `POST /app/edit_player` accepts `nickname` (trimmed; blank clears it; over 60
   characters is refused with 400) and `nicknameAsName` for the coach's own relation. The profile
   edit form on web and on iOS/Android shows the field with the warning "Visível só para ti. Evita
   alcunhas ofensivas: o jogador pode pedir acesso aos seus dados." / "Only you can see this.
   Avoid offensive nicknames: the student can request a copy of their data." and the switch
   "Usar alcunha como nome principal" / "Use the nickname as the main name".
7. **Privacy.** The subject-access export (`backend/scripts/export_user_data.py`, PAD-640) includes
   the nickname in BOTH people's exports: it is personal data about the student (owner, 2026-10-14:
   "entra no export de dados (PAD-640)"; `admin.data-export` rule 4a) — which is why the field
   warns that the student can request their data. "The student never sees it" governs the app's
   own surfaces: payloads, messages, templates, notifications, app exports (Excel/CSV) and shared
   screens. Deleting
   the student's account clears the nickname on every relation row of theirs; ending the link
   (`remove_player`, disconnect or delete) removes it with the row.
8. **Every other coach view (part 2).** Class requests, the class and standing waiting lists, the
   restriction chips, the semi-automatic approval card, the coach's evaluations views, the
   validation and presence views, the attendance and absence pages for a student, the class
   detail's marking rows (coach only) and, on iOS/Android, the class screen's join requests and
   invitees print the name through `useCoachDisplayName` (`@levelup/hooks`): one roster query,
   asked by the row's player id; a student's view never asks. Pickers list the display name, and
   their search matches either name (`rosterNicknameOf` into the shared rule, rule 5). Both parts are promoted
   together; PAD-660 closes after part 2. The web class detail's invitee list ("Convidados") and
   join-request rows resolve the same way as iOS/Android's (PAD-683, B-631).
9. **Every coach view, by construction (PAD-683, B-631; owner: "a alcunha aparece em todas as
   visões do treinador, sem exceção"; numbering unconfirmed).** Rules 3 and 8 listed views; this
   rule states the one way a coach view names a student, so a new view inherits it:
   - **(a) A coach-private payload carries it from the server.** Any payload that only the
     requesting coach can receive and that names a student of theirs — the invite picker's groups
     (`GET notify/groups`, `_serialize_cp_for_group`, also the semi-automatic queue), the coach's
     search (`notify/player_search`), the claim candidates, the `ineligible` list of an invite or
     an add, presence statistics, the coach dashboard's rows and the invite tutorial's
     simulation — adds `nickname`, `nicknameAsName` and `displayName` from the REQUESTING coach's
     relation row (`nickname_payload`), beside `name`, which stays the real name (rule 2). The
     fields are additive: an App Store build that does not read them keeps showing `name`.
   - **(b) A shared payload is resolved on the client**, never on the server (rule 3's reason: a
     club colleague reads the same class detail): the view asks `useCoachDisplayName` with the
     row's player id and the payload's real name. So does a view of a private row that carries
     only `playerId` and `name` (the `blocked` lists an invite or a reminder answers with).
   - **(c) Text sent only to the coach names the nickname; text the student can read names the
     real name.** Push titles and bodies to a coach (the cancellation notice, a chat message from
     the student, join requests, class requests, the waiting-list join, the profile-completeness
     reminder, a claim request) and messages in the coach's own Assistant conversation (the
     semi-automatic approval prompt) name the student through one server helper,
     `coach_display_name(coach_id, player, real_name)`. The same notice's text stored in the
     SHARED coach–student conversation keeps `User.name` (rule 4), because the student reads it.
     A new coach-bound send site uses the helper; a shared one never does.
   - **(d) A guard keeps it.** One source guard per app (web, iOS/Android) scans non-test source
     for the player-name accessors (`playerName`, `personName`, `user.name` / `user?.name`,
     `declinedPlayerName`, `waitingListPlayerName`, and `name` on a roster or group row) and fails
     on a hit outside `displayName(` / `coachDisplayName(` / a `displayName` field that is not on
     its allowlist. Each allowlist entry names its file, its count, its kind and its reason:
     `allowed` (an edit form, the user's own account, a student-only screen, a component gated on
     the viewer, a `.name` that is not a student) or `backlog` (a coach view still to convert);
     counts are ratcheted both ways.
   **Delivery (PAD-683, two parts promoted together, like PAD-660).** Part 1: (a) for the invite
   picker's groups, the coach's search and the `ineligible` rows; (b) for the web class detail,
   the invite toasts and the unavailable-student dialogs; (c) for every coach-bound send named
   above; (d) both guards. Part 2 (done) burned the `backlog` entries to zero, and both guards now
   fail on any `backlog` entry, so only `allowed` entries remain:
   - **Server, rule 9a** (`nickname_payload` from the REQUESTING coach's relation, one query per
     payload through `relations_by_player` / `coach_relation_payloads`): the presence statistics
     rows and the validation list's players (`presence_overview_service`); the dashboard's
     next-class avatar stack (`displayName`, initials of it), the "needs you" reply card (`playerId`,
     `displayName`, initials) and the incomplete-players block (`coach_home`,
     `profile_completeness_service`) — the student's dashboard shares the first two builders and
     never passes the coach, so it carries no nickname key; the claim candidates (which also match
     the coach's nickname in their search) and the duplicate hint's `displayName`
     (`player_claim_service`, `possible_duplicates_for`); the invite simulation's waiting-list rows,
     candidates and single-student verdict (`invite_simulation_service`).
   - **New-conversation picker, rule 9b:** `GET messageable-users` is shared with students, so a
     nickname is never put on it; a COACH viewer's rows for students on their roster gain
     `playerId` (nothing a student reads), and web and iOS resolve through `useCoachDisplayName`
     (enabled for a coach only), search either name and sort by the name shown.
   - **Clients, web and iOS/Android:** the presence table / rows, chart labels, search and sort
     (search matches both names through `rosterSearchFields`), the walk-in picker (options print and
     sort by the display name and are found by either), the dashboard cards, the claim/merge
     dialog, the invite tutorial, the parked academy-accept dialog (the row is parked whole and the
     accept resolves the name), the iOS profile's toasts, dialogs, initials and the add-to-classes
     and waiting-list dialogs, the Players tab avatar, and the restrictions' excluded-player search.
   - **Left on the real name on purpose** (`allowed` in the guards): the profile edit draft and the
     real name under the nickname, the walk-in row's `name` (a record kept real; every render
     resolves it) and the CSV export of the presences table (a file the coach may send on).
   Switching the nickname off shows the real name on every one of these, since `displayName` then
   is the real name.

### Acceptance Criteria

#### PLAYERS-NICKNAME-1: A nickname shown to its coach only (rules 1–3)
- **Given** coach A and coach B both coach "Jorge Silva", and A sets the nickname "Jorge chato"
  with the switch on
- **When** A reads the roster, and B reads theirs
- **Then** A's row reads `displayName: "Jorge chato"`, `name: "Jorge Silva"`; B's row has
  `nickname: null` and `displayName: "Jorge Silva"`

#### PLAYERS-NICKNAME-2: The student never receives it (rules 2, 4)
- **Given** that nickname
- **When** Jorge reads his own class detail, profile and messages, and a reminder is sent to him
- **Then** no payload he receives contains "Jorge chato", and the reminder text greets "Jorge"

#### PLAYERS-NICKNAME-3: Search by either name (rule 5)
- **Given** that nickname
- **When** A searches "chato", and then "silva"
- **Then** both searches list Jorge

#### PLAYERS-NICKNAME-4: The field warns and validates (rule 6)
- **Given** A on Jorge's profile edit form, on web and on iOS
- **When** A types a nickname
- **Then** the warning is shown; saving 61 characters is refused; saving blank clears it

#### PLAYERS-NICKNAME-5: Inviting to a class shows the nickname (rule 9a, PAD-683)
- **Given** coach A has nickname "Jorge chato" with the switch on for "Jorge Silva", and coach B
  also coaches Jorge
- **When** A opens "Convidar" on a class, on web and on iOS, and searches "silva"
- **Then** Jorge's group row and search row read "Jorge chato"; `GET notify/groups` gives A
  `name: "Jorge Silva"`, `displayName: "Jorge chato"`, and gives B `nickname: null`,
  `displayName: "Jorge Silva"`
- **And** with the switch off, both rows read "Jorge Silva"

#### PLAYERS-NICKNAME-6: The web class detail's invitees use it (rules 8, 9b)
- **Given** that nickname and an invitation to Jorge for A's class
- **When** A opens the class detail on web
- **Then** the "Convidados" row reads "Jorge chato"; coach B opening the same class reads "Jorge Silva"

#### PLAYERS-NICKNAME-7: A coach push names the nickname, the shared chat the real name (rule 9c)
- **Given** that nickname
- **When** Jorge cancels his place in A's class
- **Then** the push to A reads "Jorge chato …", and the notice stored in the A–Jorge conversation
  reads "Jorge Silva …"

#### PLAYERS-NICKNAME-8: The guard catches a bypass (rule 9d)
- **Given** a coach-only web view that prints `{inv.playerName}` with no allowlist entry
- **When** the guard test runs
- **Then** it fails naming the file and the line

#### PLAYERS-NICKNAME-9: Export and deletion (rule 7)
- **Given** that nickname
- **When** Jorge's data is exported, then A's, then Jorge's account is deleted
- **Then** both exports carry "Jorge chato" on the relation row, and after the deletion
  the relation's nickname is null

#### PLAYERS-NICKNAME-10: Every coach view prints the coach's own name for the student (rule 8)
- **Given** a coach who calls "Jorge Silva" "Jorge chato" with the switch on, and a student "Ana Pinto" with no nickname
- **When** the coach opens the attendance and absences pages, a class's marking rows, the class waiting list and its dialogs, the standing waiting list, the class requests, the evaluations drawer, the excluded-players chips and the approval card
- **Then** each shows "Jorge chato" and never "Jorge Silva"
- **And** each shows Ana Pinto under her own name
test: `frontend/apps/web/src/pages/AbsencesPage.nickname.test.tsx` › `prints the nickname for one student and the real name for another` (+15 more)

#### PLAYERS-NICKNAME-11: A student's own view keeps the real name and never asks for a roster (rules 4, 8)
- **Given** a student looking at their own attendance row, class row and class requests
- **When** the view renders
- **Then** it shows the student's real name
- **And** no roster is requested
test: `frontend/packages/hooks/src/useCoachDisplayName.test.tsx` › `never asks for the roster when disabled (a student's view) and returns the fallback` (+3 more)

#### PLAYERS-NICKNAME-12: The name comes from the coach's own roster row, and is the real name whenever that row offers no other (rule 3)
- **Given** a coach's roster with "Jorge Silva" nicknamed "Jorge chato" with the switch on, and "Bruno Costa" nicknamed "Bru" with the switch off
- **When** the coach's list, profile, participant pop-up and conversation list are shown
- **Then** the list shows "Jorge chato" and "Bruno Costa"
- **And** Jorge's profile and pop-up show "Jorge chato" with "Jorge Silva" under it, and Bruno's show one line
- **And** a student who is not on the roster, and a row from a server that sends no display name, show the real name
- **And** the coach's conversation list names the student "Jorge chato", and the student's own list never contains it
test: `frontend/packages/config/src/coach-display-name.test.ts` › `returns the roster row's display name for a player on the coach's roster` (+11 more)

#### PLAYERS-NICKNAME-13: What the server builds for a coach carries that coach's name for the student, and nobody else's copy does (rules 2, 9a)
- **Given** coach A's nickname "Jorge chato" for a student whom coach B also coaches
- **When** presence statistics, the validation list, the dashboard's blocks, the invite simulation, the claim candidates and the duplicate hint are built for A, for B, and for no coach
- **Then** A's rows carry the real `name` and `displayName: "Jorge chato"`, and the claim candidates are found by the nickname
- **And** B's rows carry no nickname and the real name as `displayName`
- **And** a payload built for no coach carries no `displayName`, and the list of people one may message carries neither a nickname nor a display name
test: `backend/padel_app/tests/test_pad683_part2_payloads.py` › `test_claim_candidates_carry_the_display_name_and_are_found_by_the_nickname` (+7 more)

#### PLAYERS-NICKNAME-14: A push or a prompt to the coach uses the nickname, and what the student receives never does (rules 4, 9c)
- **Given** the nickname "Jorge chato" switched on, in a conversation between the coach and the student
- **When** the student writes, the coach writes, and a replacement prompt is built for the coach
- **Then** the push to the coach is titled "Jorge chato", and the push to the student carries the coach's own name
- **And** the prompt names the student "Jorge chato" for that coach and by the real name for anyone else
- **And** in a text for the coach only the first whole-word occurrence of the real name is replaced
test: `backend/padel_app/tests/test_pad683_coach_push_names.py` › `test_a_student_message_pushes_to_the_coach_under_the_nickname` (+7 more)

#### PLAYERS-NICKNAME-15: The edit form sends the nickname only when it changed, and the create form has none (rule 6)
- **Given** the profile edit form for a student with a nickname, and the add-player form
- **When** the coach saves untouched, saves a new nickname with the switch flipped, and saves a blank nickname
- **Then** the untouched save sends no nickname and no switch; the changed one sends the trimmed nickname and the switch, with the real name unchanged
- **And** a blank nickname is sent as an empty string, which clears it
- **And** the add-player form shows no nickname field, warning or switch
- **And** the server reads the switch as on for `true` and `"true"`, and as off for `false`, `"false"`, 0 and null
test: `frontend/apps/mobile/src/features/players/player-nickname-form.test.tsx` › `submits the nickname and the switch beside the unchanged real name` (+5 more)

### Open questions

- **Rule 9's delivery note says a coach's "people I may message" rows gain `playerId`; the code sends the public shape only.**
  - Rule 9 (Delivery): "a COACH viewer's rows for students on their roster gain `playerId`".
  - The code today: the route returns the public user shape with no `playerId` and no display name (`frontend_api.py:963-969`); the test asserts both are absent, and `messaging.conversations` rule 15 pins the public shape. Clients resolve the name by user id instead. PLAYERS-NICKNAME-13 is written to the code.
  - Recommendation: keep the code and delete that sentence from rule 9.
- **Eight iOS coach views are guarded only by reading their source.** The screens cannot be mounted in the unit harness, so their tests look for the display-name call in the file. They are proposed as plain unit tests; the web renders of the same views carry PLAYERS-NICKNAME-10 and 12. Most of those web tests replace the name hook with a stand-in, so they prove that the view asks for the name, while the hook itself is proved once. Recommendation: accept, and add one Maestro check of a nickname on an iOS coach screen.
- **The field's warning text is asserted only as a translation key.** Rule 6 and PLAYERS-NICKNAME-4 quote "Visível só para ti..."; the tests check the key `players.nickname.warning`. Recommendation: accept.
- **P-PLAYERS-4 keeps one of two statements the old business spec made.**
  - The old business spec said the student never sees the nickname "in ... an export of their data", and also that a data request includes it.
  - The promise as drafted: "a data request (the student's or the coach's) includes it", with "never sees it" limited to inside the app.
  - This spec: rule 7 puts the nickname in both people's subject-access exports (owner, 2026-10-14, PAD-640), and PLAYERS-NICKNAME-9 proves it.
  - The code today: `backend/scripts/export_user_data.py` copies every column of every row that points at the person, so the coach-student row carries the nickname in both exports (`test_pad660_coach_nickname.py:129`).
  - Recommendation: the promise's wording holds; confirm it. The promise was not changed.
