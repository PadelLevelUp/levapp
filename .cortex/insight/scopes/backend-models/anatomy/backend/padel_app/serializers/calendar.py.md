---
path: backend/padel_app/serializers/calendar.py
extracted_at: 2026-09-03T14:05:38Z
extraction_level: 2
size_lines: 42
size_tokens: 284
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "0f5b50498e06560155932de1ad0c61387f2aeece615ea2938842ad8745e43caf"
---

## Purpose

`serialize_calendar_block(block)` turns a CalendarBlock into its API shape: parses `recurrence_rule` (stored as JSON text) defensively via try/except json.loads -> None, splits start/end datetime into separate date/startTime/endTime strings, and surfaces `blocksAutoInvitations`. Duck-typed against the model -- no import of CalendarBlock itself.

## Connections

Uses:
- (none within this scope)

Used by:
- (none within this scope)

Semantically related (not imports):
- backend/padel_app/models/calendar_blocks.py: reads block.recurrence_rule/type/title/description/is_recurring/blocks_auto_invitations/start_datetime/end_datetime directly
- backend/padel_app/serializers/lesson.py: independently implements the same 'stored as JSON text, try/except json.loads to None' recurrence_rule parsing pattern
