---
id: B-168
title: "Excluded-player chips show the raw player id after a reload"
type: missing-criterion
severity: medium
status: resolved
affects:
  - notifications.config
  - frontend/apps/web/src/components/settings/RestrictionsPanel.tsx
  - backend/padel_app/services/notification_service.py
proposed_fix: "GET /notify/config adds a read-only excludedPlayerNames map; both clients name the chip from it (rule 14a)."
opened: 2026-09-24T20:28:41Z
resolved: 2026-09-24T21:01:39Z
---

# B-168: excluded-player chips show ids after a reload

**Source:** Session-D, found while porting the restrictions to iOS (PAD-433). The id comes from Session-D's range B-168–170.

**What happens:** a coach excludes a student in Settings → Notifications → Restrictions. The chip reads the student's name only until the page reloads. After that it reads the bare player id, for example `42`. The name exists only in `ExcludedPlayersRow`'s session-local `playerNames` state, which is filled by the search. The config carries `restrictions.excludedPlayers.playerIds` alone, so after a reload the panel has no way to name anyone.

**What should happen:** the chip names the student on every load.

## Evidence

- `RestrictionsPanel.test.tsx` (red first) renders the panel with `playerIds: ["42"]`, as a reload would. The row's text is `…excludedPlayersDescription42`: the chip is the id.
- `get_config_dict` (`notification_service.py:104`) composes `restrictions` from the typed columns and the `excluded_player_ids` JSON, and has no name.

## Diagnostic tree

1. Dev spec: `notifications.config`. Yes.
2. Rule: rule 6 names `excludedPlayers`, but no rule says what the coach sees for a saved exclusion.
3. Criterion: none. **Missing criterion** (the new rule 14a and its criterion make it explicit).

Drift: none. The business spec only says the coach sets restrictions.

## Change plan

- **Spec:** `notifications.config` rule 14a, plus the criterion "An excluded player is named after a reload".
- **Backend:** `get_config_dict` adds `excludedPlayerNames`, limited to the coach's own players. `update_config` already ignores unknown keys.
- **Web:** `RestrictionsPanel` takes `excludedPlayerNames` and seeds its chip labels from it.
- **iOS:** the new restrictions section does the same.

### Resolution

- **Spec:** `notifications.config` rule 14a, plus the criterion "An excluded player is named after a reload (PAD-433, B-168)".
- **Backend:** `notification_service._excluded_player_names`, called from `get_config_dict`: the coach's own players, excluding deleted accounts. POST ignores the key.
- **Web:** `RestrictionsPanel` names each chip from `excludedPlayerNames`, which `NotificationsEngineSection` passes in.
- **iOS:** `restrictions-section.tsx` does the same (PAD-433 ports the whole panel).
- **Tests:**
  - `test_pad433_excluded_player_names.py` 5/5, red first. The coach-scope and deleted-account filters are each killed by a mutant.
  - `RestrictionsPanel.test.tsx`, red first (the chip read `42`).
  - `restrictions-section.test.tsx`: the chip cells, killed by a mutant.
  - Maestro flow 105 on the pinned simulator shows the seeded student's name on the chip.
