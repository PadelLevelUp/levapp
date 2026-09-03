---
path: backend/padel_app/serializers/coach.py
extracted_at: 2026-09-03T14:05:38Z
extraction_level: 2
size_lines: 9
size_tokens: 51
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "a1524c2b21dabc885453d719a72d97ed05d9a13c93a7ba9feed554713a3b22f3"
---

## Purpose

`serialize_coach(coach)`: {id, userId, user: serialize_user(coach.user)} -- a thin wrapper reusing serialize_user for the actual identity payload. Nearly identical in shape to serializers/player.py.

## Connections

Uses:
- backend/padel_app/serializers/user.py: serialize_user builds the embedded user payload

Used by:
- (none within this scope)

Semantically related (not imports):
- backend/padel_app/models/coaches.py: reads coach.id/user_id/user directly (duck-typed)
- backend/padel_app/serializers/player.py: near-identical thin wrapper of serialize_user, differing only in the id/userId source object
