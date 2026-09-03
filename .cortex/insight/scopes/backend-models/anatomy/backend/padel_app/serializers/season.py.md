---
path: backend/padel_app/serializers/season.py
extracted_at: 2026-09-03T14:05:38Z
extraction_level: 2
size_lines: 3
size_tokens: 16
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "a5de26d98882c39f5df9473cf6a3b8d14e6fdb4eeabeef66e08d2a696bbd6d3e"
---

## Purpose

`serialize_season(season)` is a one-line passthrough to `season.frontend_dict()` -- the model owns the actual shape.

## Connections

Uses:
- (none within this scope)

Used by:
- (none within this scope)

Semantically related (not imports):
- backend/padel_app/models/seasons.py: delegates entirely to Season.frontend_dict()
