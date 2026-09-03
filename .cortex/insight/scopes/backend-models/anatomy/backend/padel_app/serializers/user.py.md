---
path: backend/padel_app/serializers/user.py
extracted_at: 2026-09-03T14:05:38Z
extraction_level: 2
size_lines: 18
size_tokens: 148
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "7d15e51b179d62ab08407901591a07746f53c26c9ffc81e67784b3e2cd90b7bf"
---

## Purpose

`serialize_user(user)` is the base identity payload (id/name/username/email/phone/isActive/language/avatarUrl/abbreviation) reused inside serialize_coach and serialize_player -- the actual shared core of both. PAD-81: `abbreviation` now delegates to `user.abbreviation_display` (the model-level stored-override-else-derive-initials logic) rather than deriving initials inline as this function used to.

## Connections

Uses:
- (none within this scope)

Used by:
- backend/padel_app/serializers/coach.py: embeds this as the user payload
- backend/padel_app/serializers/player.py: embeds this as the user payload

Semantically related (not imports):
- backend/padel_app/models/users.py: reads name/username/email/phone/status/language/user_image_url/abbreviation_display directly
