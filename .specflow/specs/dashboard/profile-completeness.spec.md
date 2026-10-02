---
id: dashboard.profile-completeness
status: implementing
depends_on: [dashboard.blocks, players.list, players.join-token, messaging.messages]
implements: ../../specs-business/dashboard/user-relies-on-the-dashboard.business.md
governed_by: []
---

# dashboard.profile-completeness

### Intent
A coach–student link with no level or no side quietly costs the student invitations and class
requests. Today that happens to every student who joins by link or QR (`players.join-token`:
the link is created with neither) and to everyone whose level was deleted from the coach's ladder
(`level_id` is set null). PAD-486 tells the coach on the dashboard; PAD-490 tells the student why
classes are missing and lets them remind the coach.

### Entities
- **READS:** Association_CoachPlayer (`level_id`, `side`), Player, User, Coach, Message
- **WRITES:** Message, Conversation (through the direct-conversation helper)

### Rules
1. **Incomplete link.** A `coach_in_player` row is incomplete when its `level_id` is null or its
   `side` is null. Disabled accounts are not counted, matching the Players page alerts
   (`players.list` rules 2 and 5), which read the same two columns.
2. **What it costs** (the copy must say so): with no level a student fails every level rule
   (`student_has_no_level`, fail-closed), so no invitations to a class with a level rule and no join
   request to one; with no side a student is never offered a left- or right-only spot and does not
   count in side balancing. Classes with no level rule and private class requests still work.
3. **Coach block (PAD-486).** `GET /api/app/dashboard` for a coach carries a top-level block
   `{id: "incomplete_players", type: "incomplete_players", data: {count, missingLevel, missingSide,
   players: [{playerId, name, missing: ["level"|"side", …], href: "/players/<playerId>"}],
   seeAllHref}}` right after `needs_you`, listing the first 5 by name, while `count > 0`; omitted
   entirely when it is 0. A tap on a player opens that player (web `/players/<id>`, iOS
   `/player/<id>`); "see all" opens the Players list with the missing-level filter
   (`seeAllHref` `/players?missing_level=true`, or `missing_side` when no level is missing).
4. **Student block (PAD-490).** `GET /api/app/dashboard` for a student carries a top-level block
   `{id: "profile_incomplete", type: "profile_incomplete", data: {coaches: [{coachId, coachName,
   missing, remindedToday}]}}` right after the next-class hero, one entry per linked coach whose
   link is incomplete; omitted entirely when there is none. It disappears for a coach as soon as
   that coach sets both.
5. **Old builds.** Both blocks are new top-level types. Every installed iOS build skips a top-level
   block type it does not know (1.0.0/1.1.2: `renderBlock`'s `default: return null`; 1.2.0/1.2.1:
   blocks are looked up by type and the rest are never read), and the web looks blocks up by type.
   Neither is a `needs_you` item kind, which an old iOS build would render as a broken card.
6. **Remind the coach.** `POST /api/app/profile-reminder {coachId}` (student only):
   a. the caller must be a player with a `coach_in_player` row for that coach, else 404 — a student
      cannot remind a coach they are not linked to, nor act for another student (the player is
      always the caller's own);
   b. a complete link answers `409 {code: "profile_complete"}` and sends nothing;
   c. one reminder per student per coach per **club day** (Lisbon): a second one the same day answers
      `409 {code: "already_reminded"}` and sends nothing. The day is `club_day_start_utc` of now, so it
      turns at Lisbon midnight, not UTC midnight;
   d. otherwise it writes one chat message from the student to the coach in their direct
      conversation (created if absent), `message_type: "profile_reminder"`,
      `msg_metadata: {profileReminder: {coachId, missing}}`, in the coach's language
      ("Olá treinador, o meu perfil ainda não está completo (falta: nível, lado)." / "Hi coach, my
      profile isn't complete yet (missing: level, side)."), publishes it over SSE and sends the
      normal message push to the coach. It is an automatic message (`messaging.messages` rule 6).
7. **After pressing.** The block's entry reads `remindedToday: true`; the button becomes disabled
   "Lembrete enviado hoje" / "Reminder sent today" until the next club day. The card stays until
   the profile is complete.

### Acceptance Criteria

#### The coach sees who is missing what (rule 3)
- **Given** coach C with students A (no level), B (no side), D (both set) and a disabled E with no level
- **When** C opens the dashboard
- **Then** the `incomplete_players` block has count 2, lists A tagged level and B tagged side, and not D or E

#### The coach block is gone when everything is set (rule 3)
- **Given** coach C whose every active student has a level and a side
- **When** C opens the dashboard
- **Then** no `incomplete_players` block is in the payload

#### A student who joined by link sees why (rule 4)
- **Given** student S joined coach C by link, so their link has no level and no side
- **When** S opens the dashboard
- **Then** the `profile_incomplete` block names C with missing level and side and `remindedToday: false`

#### A reminder reaches the coach once a day (rule 6)
- **Given** that S
- **When** S POSTs `/api/app/profile-reminder {coachId: C}` twice the same Lisbon day
- **Then** the first answers 200 and C's thread holds one `profile_reminder` message from S, the second answers 409 `already_reminded` and nothing more is written, and S's block reads `remindedToday: true`

#### The day turns at Lisbon midnight (rule 6c)
- **Given** S reminded C at 23:30 Lisbon time on a summer day (22:30 UTC)
- **When** S reminds again at 00:10 Lisbon time the next day (23:10 UTC, still the previous UTC day)
- **Then** the second reminder is sent

#### No reminder for a complete profile or a stranger (rule 6a–b)
- **Given** S's link to C is complete, and S has no link to coach X
- **When** S reminds C, and S reminds X
- **Then** C answers 409 `profile_complete`, X answers 404, and no message is written

#### Both shells show both blocks (rules 3, 4, 7)
- **Given** the data above
- **When** C and S open the dashboard on web and on iOS
- **Then** C sees the block with names that open the player, and S sees the card with "Remind my coach", which reads "Reminder sent today" after a tap
