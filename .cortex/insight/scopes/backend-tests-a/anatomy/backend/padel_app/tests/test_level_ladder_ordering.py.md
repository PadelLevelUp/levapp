---
path: backend/padel_app/tests/test_level_ladder_ordering.py
extracted_at: 2026-09-03T00:00:00Z
extraction_level: 2
size_lines: 305
size_tokens: 3239
centrality: medium
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "740ff9bcdc5e01c6ba5a4cdd22bfdcde456c9d4990bf3839d9470f44873df0d0"
---

## Purpose

PAD-70 — the invitation engine must respect the coach's CUSTOM level
ordering, not raw `display_order` integers. Reported symptom: a ladder
`4` (strongest) -> `5` -> `5-` (weakest) had a `5-` student invited to a
`4` vacancy under a "one level above" rule, though they were two rungs
away. Root cause: adjacency was computed from the raw `display_order`
INTEGER, so any level with an unset order (`NULL` or the column default
`0`) sorted AHEAD of every explicitly ordered level and read as "one
above the top of the ladder". `TestLadderAdjacency` pins
`_level_ids_one_above`/`_level_ids_one_below` use ladder POSITION: only
the immediately adjacent level qualifies (not two steps away), the top/
bottom of the ladder has nothing above/below, an unset `display_order`
(`None` or `0`) sorts to the BOTTOM (ties broken by id) rather than
masquerading as strongest, duplicate `display_order` values collapse to a
single-step ladder, and another coach's levels are ignored entirely.
`TestGroupLevelRules` reproduces the actual reported symptom end-to-end
through `_passes_group_rules`: a `5-` student (unset order) fails a
"one above a `4` vacancy" rule; `one_above_vacancy` admits only the truly
adjacent level; `all_above_vacancy`/`all_below_vacancy` both use ladder
position, so the unordered level sorts as "below". `TestDisplayOrderNormalisation`
pins the write-side fix: `upsert_coach_levels` renumbers the whole ladder
contiguously even when the client omits an order for one entry;
`create_coach_level_service` appends a new single level to the bottom
(next contiguous number); `bulk_create_coach_levels` (CSV import, no
order column) assigns contiguous order in ROW order.

## Connections

- Uses: `padel_app.services.notification_service`
  (`_level_ids_one_above`, `_level_ids_one_below`, `_passes_group_rules`);
  `padel_app.services.coach_service` (`upsert_coach_levels`,
  `create_coach_level_service`); `padel_app.services.import_service`
  (`bulk_create_coach_levels`); models `padel_app.models.users.User`,
  `padel_app.models.coaches.Coach`, `padel_app.models.coach_levels.CoachLevel`,
  `padel_app.models.players.Player`, `padel_app.models.Association_CoachPlayer`.
- Used by: (none — leaf test file)
- Semantically related (not imports): shares helper naming
  (`_create_coach`, `_create_level`, `_create_coach_player`,
  `_FakeVacancy`) and the invitation-engine level domain with
  `test_effective_level_resolution.py` — this file focuses on ladder
  POSITION/adjacency, that one on which level a vacancy resolves to in
  the first place.
