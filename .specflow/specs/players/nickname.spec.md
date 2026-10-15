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
   PAD-665, takes both fields).
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
8. **Not yet covered (part 2; both parts are promoted together, and PAD-660 closes after part 2).** Class requests, waiting lists, the semi-automatic approval card,
   evaluations, the attendance and presences lists, and the class detail's "Editar presenças" marking
   rows keep the real name until they adopt rule 3.

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

#### Export and deletion (rule 7)
- **Given** that nickname
- **When** Jorge's data is exported, then A's, then Jorge's account is deleted
- **Then** both exports carry "Jorge chato" on the relation row, and after the deletion
  the relation's nickname is null
