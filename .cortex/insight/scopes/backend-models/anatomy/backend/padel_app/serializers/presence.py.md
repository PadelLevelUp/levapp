---
path: backend/padel_app/serializers/presence.py
extracted_at: 2026-09-03T14:05:38Z
extraction_level: 2
size_lines: 12
size_tokens: 109
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "d88b7d2b59211301dec394df26196c6ce0d12c803227f7ca03f6f6f3f2e93f79"
---

## Purpose

`serialize_presence(presence)`: flat camelCase dict of Presence fields including lateCancellation. Duck-typed, no imports.

## Connections

Uses:
- (none within this scope)

Used by:
- backend/padel_app/serializers/lesson.py: builds each presences entry in serialize_class_instance

Semantically related (not imports):
- backend/padel_app/models/presences.py: reads presence.id/lesson_instance_id/player_id/status/justification/invited/confirmed/validated/late_cancellation directly
