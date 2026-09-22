---
id: players.edit
status: implemented
depends_on: [players.create]
implements: ../../specs-business/players/coach-edits-player-details.business.md
governed_by: []
---

# players.edit


### Intent
Coaches update player information, including level, side preference, and personal details.

### Rules
1. Coach can update: name, email, phone, level_id, side. The `side` accepts `left`, `right`, or `both`.
2. Level changes create a PlayerLevelHistory entry (audit trail), through the one writer
   `set_roster_level` (players.level-history rule 1). Before PAD-270 an edit wrote none (B-061).
3. Only the associated coach can edit their players

4. **What was sent is what is written (PAD-388, B-136).** `POST /api/app/edit_player` (rule 1's
   `PATCH /api/app/player/{id}` is not the route the apps call) writes only the keys present in
   `updates` that differ from the `player` snapshot; an omitted key means keep — which is what the
   App Store builds send for an emptied box, so they go on working unchanged. A present `null` or
   `""` CLEARS `notes`, `side`, `phone` and `levelId` (the level through the one writer, rule 2,
   which records no history row for a clear) — and `email` only while the player is a placeholder:
   **once a student has an account (a password), the e-mail is their login and password recovery
   and becomes the student's own field — a coach may neither clear nor change it** (Coordinator,
   2026-09-22); any `email` a coach sends for an account holder is answered 400 `["email"]`,
   nothing written; the student changes it from their own settings. Both shells lock the e-mail box
   once the player has an account (`validated`), whatever `isActive` says. Phone stays the coach's
   to clear. A `levelId` of 0/false is 400 `["level"]` before any write. A present empty `name` is answered
   `400 {"error": "invalid_fields", "fields": ["name"]}` and nothing is written. Only `name`,
   `email`, `phone`, `levelId`, `side`, `notes` are read: nothing else on the user record
   (`username`, `status`, `password`, admin flags) is reachable through this route. The current
   web and iOS apps send `null` for an emptied notes, phone or e-mail box; level and side have no
   clear control yet. A placeholder's e-mail is the coach's; an account
   holder's is not (above).

### Acceptance Criteria

#### Edit player level
- **Given** a player with id 3 associated with the authenticated coach
- **When** they PATCH to `/api/app/player/3` with `{"level_id": 2, "side": "left"}`
- **Then** the `coach_in_player` record is updated with the new level and side
- **And** a `player_level_history` entry is created with the new level

#### Set player side to "Both"
- **Given** a player with id 3 associated with the authenticated coach
- **When** they PATCH to `/api/app/player/3` with `{"side": "both"}`
- **Then** the `coach_in_player` record persists `side = "both"`
- **And** the player profile displays the side in the coach's active UI language
  (`en` → "Both", `pt` → "Ambos"), rendered from the shared `players.side*` i18n keys
  and not from a hardcoded label table (PAD-182)

#### Edit player personal info
- **Given** a player with id 3
- **When** they PATCH to `/api/app/player/3` with `{"name": "John Updated", "phone": "+351912345678"}`
- **Then** the User record is updated with the new name and phone

#### An emptied note or phone is cleared (rule 4)
- **Given** a player with notes "left-handed, bad knee" and a phone
- **When** the coach's app sends `updates: {"notes": null, "phone": null}`
- **Then** the answer is 200 and both are NULL; the name and e-mail are unchanged

#### A placeholder's e-mail is the coach's; an account holder's is the student's (rule 4)
- **Given** a placeholder (never activated, no password) with an e-mail
- **When** the coach sends `{"email": null}`, or `{"email": "corrected@x.pt"}`
- **Then** the e-mail is NULL, or the corrected address
- **Given** a student who has an account (a password)
- **When** the coach sends `{"email": null, "notes": "new note"}`, `{"email": "   "}` or `{"email": "other@x.pt"}`
- **Then** the answer is 400 with `fields` `["email"]`, and neither the e-mail nor the note changed
- **And** the e-mail box is read-only in the coach's edit form on web and iOS

#### A zero level is refused before anything is written (rule 4)
- **Given** the same player
- **When** the coach sends `{"name": "Renamed", "levelId": 0}`
- **Then** the answer is 400 with `fields` `["level"]` and the name is unchanged

#### A cleared level is no level and writes no history (rules 2, 4)
- **Given** a player at level 5 for this coach
- **When** the coach sends `{"levelId": null}`
- **Then** the roster level is NULL and the level history has no new row

#### An emptied name is refused (rule 4)
- **Given** the same player
- **When** the coach sends `{"name": "", "notes": "new note"}`
- **Then** the answer is 400 with `fields` `["name"]`, and neither the name nor the note changed

#### An old build's body keeps everything (rule 4)
- **Given** App Store 1.1.0 sending the full form with the emptied note box OMITTED
- **When** the request lands
- **Then** the note is still there
