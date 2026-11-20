---
constants:
  PENDING_REGISTRATION: "users.status = 'inactive' AND users.password IS NULL (the placeholder of players.remove rule 5)"
  NEEDS_CONFIGURING: "coach_in_player.level_id IS NULL OR coach_in_player.side IS NULL"
  EVOLUTION_MIN_RECORDS: 2
  PROFILE_PERIOD_PRESETS: "1w, 1m, 1y, season"
  PROFILE_PERIOD_DEFAULT: "1m"
---

# players constants

Facts used by more than one players spec (PAD-834). New file; nothing under `specflow/impl/players/` had one.

- `PENDING_REGISTRATION`: who is "Registo pendente" on the roster and on the profile
  (`players.list` rules 13–14, `players.profile` rule 11, `players.remove` rule 9). It is the
  placeholder of `players.remove` rule 5, defined once in code as `_is_placeholder_user`
  (`backend/padel_app/models/players.py`), with a SQL twin for the roster's filter and count
  (`players.list` rules 5, 14). Every pending player carries an `activationToken` (`auth.activate`);
  an inactive user with a password carries one too, so the token does not define the state. It is NOT `!validated`: a student who signed up with Google or Apple is
  `active` with no password (`registration_service.complete_social_signup`), has an account, and
  must never read as pending.
- `NEEDS_CONFIGURING`: "por configurar". The same predicate as `dashboard.profile-completeness`
  rule 1 and the roster's `incomplete=true` filter (`players.list` rule 5).
- `EVOLUTION_MIN_RECORDS`: the profile's Evolução column shows from this many records of the
  coach–player link (`players.profile` rule 10).
- `PROFILE_PERIOD_PRESETS` / `PROFILE_PERIOD_DEFAULT`: the period chips of the profile's
  Assiduidade block (1S / 1M / 1A / Época), the presets `presetRange` already computes for the
  attendance pages (`calendar.seasons` rule 14, `attendance.history` rule 10), without the custom
  range.
