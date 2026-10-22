---
id: players.nickname
status: draft
depends_on: [players.edit, players.list, players.remove]
implements: ../../specs-business/players/coach-nicknames-a-player.business.md
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
   above; (d) both guards. Part 2 burns the `backlog` entries to zero: presence statistics, the
   dashboard rows, the claim candidates, the invite tutorial's simulation, the new-conversation
   picker and the iOS profile's dialogs; after it no coach-only file holds a `backlog` entry.
   Switching the nickname off shows the real name on every one of these, since `displayName` then
   is the real name.

### Acceptance Criteria

#### A nickname shown to its coach only (rules 1–3)
- **Given** coach A and coach B both coach "Jorge Silva", and A sets the nickname "Jorge chato"
  with the switch on
- **When** A reads the roster, and B reads theirs
- **Then** A's row reads `displayName: "Jorge chato"`, `name: "Jorge Silva"`; B's row has
  `nickname: null` and `displayName: "Jorge Silva"`

#### The student never receives it (rules 2, 4)
- **Given** that nickname
- **When** Jorge reads his own class detail, profile and messages, and a reminder is sent to him
- **Then** no payload he receives contains "Jorge chato", and the reminder text greets "Jorge"

#### Search by either name (rule 5)
- **Given** that nickname
- **When** A searches "chato", and then "silva"
- **Then** both searches list Jorge

#### The field warns and validates (rule 6)
- **Given** A on Jorge's profile edit form, on web and on iOS
- **When** A types a nickname
- **Then** the warning is shown; saving 61 characters is refused; saving blank clears it

#### Inviting to a class shows the nickname (rule 9a, PAD-683)
- **Given** coach A has nickname "Jorge chato" with the switch on for "Jorge Silva", and coach B
  also coaches Jorge
- **When** A opens "Convidar" on a class, on web and on iOS, and searches "silva"
- **Then** Jorge's group row and search row read "Jorge chato"; `GET notify/groups` gives A
  `name: "Jorge Silva"`, `displayName: "Jorge chato"`, and gives B `nickname: null`,
  `displayName: "Jorge Silva"`
- **And** with the switch off, both rows read "Jorge Silva"

#### The web class detail's invitees use it (rules 8, 9b)
- **Given** that nickname and an invitation to Jorge for A's class
- **When** A opens the class detail on web
- **Then** the "Convidados" row reads "Jorge chato"; coach B opening the same class reads "Jorge Silva"

#### A coach push names the nickname, the shared chat the real name (rule 9c)
- **Given** that nickname
- **When** Jorge cancels his place in A's class
- **Then** the push to A reads "Jorge chato …", and the notice stored in the A–Jorge conversation
  reads "Jorge Silva …"

#### The guard catches a bypass (rule 9d)
- **Given** a coach-only web view that prints `{inv.playerName}` with no allowlist entry
- **When** the guard test runs
- **Then** it fails naming the file and the line

#### Export and deletion (rule 7)
- **Given** that nickname
- **When** Jorge's data is exported, then A's, then Jorge's account is deleted
- **Then** both exports carry "Jorge chato" on the relation row, and after the deletion
  the relation's nickname is null
