---
path: backend/padel_app/tools/username_tools.py
extracted_at: 2026-09-03T15:00:00Z
extraction_level: 2
size_lines: 35
size_tokens: 385
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "d449325f11132cf0806c7f474250acd41bbb1cc59ed622a84522f914f0c1b285"
---

## Purpose

Generates and detects placeholder usernames for accounts a coach creates on a player's behalf (PAD-105, PAD-32) before the player has chosen a real login credential. `unique_placeholder_username` mints `pending-<16 hex chars>` (deliberately unguessable, and these rows have no password hash yet, so it is not a security-relevant secret); `is_placeholder_username` checks the `pending-` prefix. The module docstring is explicit that `username` is NOT NULL/UNIQUE on `users` but is a login credential, so only the eventual owner should ever choose the real value.

## Connections

- Uses: `padel_app.models.User`, imported lazily inside `unique_placeholder_username` — the docstring notes this module is pulled in by services that are themselves imported while the model layer is still being assembled, so a top-level import would risk a circular-import failure
- Used by: `padel_app/modules/frontend_api.py`: `is_placeholder_username` (imported as `from padel_app.tools.username_tools import is_placeholder_username`); `padel_app/services/player_service.py` and `padel_app/services/player_invitation_service.py` (outside this scope) for player-creation/invitation flows
