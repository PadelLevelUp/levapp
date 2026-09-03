---
path: backend/padel_app/services/player_invitation_service.py
extracted_at: 2026-09-03T13:58:46Z
extraction_level: 2
size_lines: 130
size_tokens: 923
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "bdb71e3d6749c30008bfa7a5c13f7f597474bd8d24de565ddc4ebb230a1ba031"
---

## Purpose

The mirror of `club_service.py`'s coach-invitation flow, but for
players: `create_incomplete_player_service` lets a coach register a
player with just a name (creating a placeholder `User`/`Player`/
`Association_CoachPlayer`, status `"inactive"`) and issues a 7-day
`PlayerInvitation` token; `accept_player_invitation_service` is what the
player uses to self-activate (set username/password, flip
`status="active"`); `revoke_player_invitation_service` lets the inviting
coach cancel a pending invitation. Same lazy-expiry pattern as
`club_service.get_coach_invitation_service`.

## Connections

- Uses: `padel_app.models` (`Association_CoachPlayer`, `Player`,
  `PlayerInvitation`, `PlayerLevelHistory`, `User`); `padel_app.sql_db.db`;
  `padel_app.tools.username_tools.unique_placeholder_username`;
  `werkzeug.security.generate_password_hash`.
- Used by: player-invitation routes (outside this scope, in the API layer).

## Insights

- `create_incomplete_player_service` writes a `PlayerLevelHistory` row
  only when a `levelId` is supplied at creation — the level assignment
  is tracked historically from the moment it's first set, not just on
  later edits.
- Only the ORIGINALLY inviting coach (`invitation.invited_by_coach_id`)
  may revoke a pending invitation — not any coach who shares the player.
