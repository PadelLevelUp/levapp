---
constants:
  ENGINE_RUN_EVERY: "1 minute"
  ENGINE_T_FLOOR: "1 minute"
  SIDE_QUOTA: "capacity / 2"
  LOWER_TIER_PER_SPOT: 1
  METHOD_B_PART: "3 × (n − 1) − i parts for tier i (0-based) of n tiers with candidates; n = 1 takes the whole useful time"
  KIND_SORRY: "sorry"
  KIND_REOFFER: "reoffer"
  KIND_ADDED: "added"
  KIND_SIDE_MOVED: "side_moved"
  KIND_WAITING_LIST_INVITE: "waiting_list_invite"
  COACH_ALERT: "coach_alert"
---

# notifications constants

Facts used by more than one surface of the redesigned invitation engine (PAD-899) and its scenario
suite.

- `ENGINE_RUN_EVERY`: the background planning run's period (plan §6).
- `ENGINE_T_FLOOR`: the smallest value a timing setting may take (`between_rounds`, `between_groups`,
  ruling D-E6). Today's floor is 15 minutes (`MIN_INACTIVE_MINUTES`,
  `backend/padel_app/models/notification_config.py:382`).
- `SIDE_QUOTA`: side's quota per value (D19). Not a setting.
- `LOWER_TIER_PER_SPOT`: what a tier that is not the type's ideal tier sends per covered spot (D17).
- `METHOD_B_PART`: Method B's split (coordinator ruling, 2026-11-11). At each send, the tier at rank r
  among the n tiers taking part gets parts[r] over sum(parts[r:]) of the useful time left (engine-settings
  rule 2), which with no tier dropping out is its part over the sum of the parts; 4 tiers 9:8:7:6, 3 tiers 6:5:4, 2 tiers 3:2, 5
  tiers 12:11:10:9:8 — the last tier always gets two thirds of the first. One tier gets all of it.
- `KIND_SORRY`: the engine's message kind for plan §7's "sorry, plus the offer to join the waiting
  list" (`invitation_engine/effects.py` `MessageKind`). The scenario format logs it as `aviso` (H's
  convention 1); `adapters/new.py` maps `sorry` to `aviso`.
- `KIND_REOFFER`: the re-offer of the same invitation (Q6; coordinator ruling (1) of 2026-11-11).
- `KIND_ADDED`: the notice to a student placed by automatic entry.
- `KIND_SIDE_MOVED`: the notice to a regular moved to the other side at `last_invite_at` (ruling (2)).
- `KIND_WAITING_LIST_INVITE`: the engine's kind for an invitation sent from a waiting list (group 0a
  or 0b). It is today's template key of the same meaning (`DEFAULT_MESSAGE_TEMPLATES["waiting_list_invite"]`,
  `backend/padel_app/models/notification_config.py:57`). Renamed from the engine's `waiting_list_offer`
  (PAD-913, swap decision 8): today's `waiting_list_offer` is "spot taken, join the list?", which is
  the engine's `KIND_SORRY`.
- `COACH_ALERT`: §6 step 4's coach alert; the engine's `CoachAlert` effect, the scenario expectation
  `coach_alert: true` (validator on PAD-900).
