---
path: backend/padel_app/serializers/coach_level.py
extracted_at: 2026-09-03T14:05:38Z
extraction_level: 2
size_lines: 8
size_tokens: 49
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "a980e18c14cbe5b1ac384df8a7a9027794c000faa47abeca2fb235f0ab4277c9"
---

## Purpose

`serialize_coach_level(l)`: flat camelCase dict of CoachLevel fields (id/coachId/code/label/displayOrder). Duck-typed, no imports.

## Connections

Uses:
- (none within this scope)

Used by:
- (none within this scope)

Semantically related (not imports):
- backend/padel_app/models/coach_levels.py: reads l.id/coach_id/code/label/display_order directly
