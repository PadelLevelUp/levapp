---
id: B-057
title: "Removing an active student by their only coach deletes the student's own Player record, presences and level history"
type: layer-drift
severity: high
status: resolved
affects:
  - players.remove
  - backend/padel_app/services/player_service.py
proposed_fix: "Align the code to players.remove: a coach disconnects from a student with an account (only the roster link and that coach's own notes and evaluations go) and can never delete them (409 PLAYER_HAS_ACCOUNT); only a placeholder (never activated, no password, whatever the username) is deleted (PAD-260 rule 3), with an audit row."
opened: 2026-09-10T16:00:00Z
resolved: 2026-09-10T17:30:00Z
---

# B-057 — Removing an active student by their only coach deletes their history

**Source:** data-model audit 2026-09-02, M15b ("`remove_player_service` hard-deletes with no audit
trail"), re-read on staging `96560cc6` on 2026-09-10 (PAD-274). This is live data loss on staging.

**What happens:** `POST /api/app/remove_player` calls `remove_player_service`. When the removing coach
is the student's **only** coach and the student's account is **active**, it runs `player.delete()`.
That deletes the student's own `Player` row and, through the cascades, their presences, their level
history, their lesson and instance enrolments, and every coach's notes and evaluations. The student
keeps an account with no player profile and no history. Nothing is recorded anywhere.

**What should happen:** `players.remove` rules 1–3 say removal takes the `coach_in_player` link
and never deletes the User or the Player. The coach loses the student from their roster, and the
coach's own notes and evaluations go with the link; the student's attendance and level history stay
with the student. PAD-260 (#179, rule 3) permits one exception: a never-activated, coach-created
placeholder with one coach may be deleted, profile first, then account.

**Root cause:** type 6, layer drift. The spec described link-only removal; the code grew a "one
coach, active → delete the player" branch that no spec or test covered.

**Evidence:** `services/player_service.py` `remove_player_service`, the branch
`elif user.status == "active": player.delete()`.

### Change plan
- The owner's rule, relayed by the coordinator on 2026-09-10: a coach must never be able to delete a
  student who has an account, with no "only coach" exception. The coach disconnects instead: the
  roster link and that coach's own notes and evaluations go; the student's record, presences and
  level history stay. A coach may delete only a placeholder they created that no one has claimed.
  The coordinator then fixed the definition: a placeholder is a player who never activated and has no
  password, whatever the username; the roster's `deletable` field drives both apps.
- `remove_player` takes `action` (`disconnect` | `delete`). A `delete` of an account holder is 409
  `PLAYER_HAS_ACCOUNT` and changes nothing; of a placeholder another coach also has, 409
  `PLAYER_HAS_OTHER_COACHES`. No `action` (older clients) deletes a sole-coach placeholder and
  disconnects everyone else, so it can never delete an account.
- Web and iOS say "Disconnect" for a student with an account and "Delete" only for a placeholder.
- Every removal writes a `deletion_audit` row (PAD-274, coordinator decision D2).
- The confirmation shows the impact counts, from `GET /api/app/player/<id>/removal_impact`.
- A test, red first: the student's presences and level history survive removal by their only coach.

### Resolution
Resolved in PAD-274.
- Spec changes: `players.remove` rules 1–8 and five criteria; the players business spec's journey and
  rules (disconnect vs delete).
- Tests, each watched failing first: `test_pad274_deletes.py` (disconnect keeps the record, with and
  without `action`; a delete of an account holder is 409 and changes nothing; a placeholder is
  deleted and audited; a shared placeholder is 409; the impact endpoint and its 403), and the
  Playwright spec `e2e/players/player-removal.spec.ts`.
- Code: `remove_player_service` and `player_removal_impact` in `services/player_service.py`, the
  `deletion_audit` table, and the web and iOS player screens.
