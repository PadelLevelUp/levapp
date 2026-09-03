---
path: backend/padel_app/serializers/player.py
extracted_at: 2026-09-03T14:05:38Z
extraction_level: 2
size_lines: 10
size_tokens: 52
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "d6e66d17981d341e16da575aa2df4e6f4e49f1d82ca23dccdfd7edb4d2aca5e7"
---

## Purpose

`serialize_player(player)`: {id, userId, user: serialize_user(player.user)} -- the student-side mirror of serializers/coach.py, same thin-wrapper shape.

## Connections

Uses:
- backend/padel_app/serializers/user.py: serialize_user builds the embedded user payload

Used by:
- backend/padel_app/serializers/lesson.py: builds each participants entry in serialize_class_instance

Semantically related (not imports):
- backend/padel_app/models/players.py: reads player.id/user_id/user directly (duck-typed)
