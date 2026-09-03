---
path: backend/padel_app/services/level_ladder.py
extracted_at: 2026-09-03T13:58:46Z
extraction_level: 2
size_lines: 102
size_tokens: 965
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "2b5deb0b550ea2b035bff867d27e456773fea0b61c1c1a58eb53f70ffcfaa53e"
---

## Purpose

The single canonical definition of a coach's skill-level ordering:
`display_order` is ambiguous on its own (nullable, defaults to 0, can be
duplicated/sparse), so this module defines the real ordering as
**position in the ladder** rather than raw integer comparison. Provides
`sort_ladder`/`ladder_sort_key` (unordered levels sink to the bottom, `id`
breaks ties), `get_level_ladder`/`ladder_index`/`ladder_index_map` for
reading a coach's ordered levels and a level's position, and
`next_display_order`/`normalize_display_orders` for writing — appending
new levels safely and renumbering to a contiguous `1..N` after batch
writes so gaps/duplicates/unset orders never reach the notification
engine (PAD-70 fix).

## Connections

- Uses: `padel_app.models.coach_levels.CoachLevel` (imported lazily inside
  functions to avoid a circular import at module load).
- Used by: `services/coach_service.py` (`upsert_coach_levels`,
  `create_coach_level_service`); `services/notification_service.py`
  (level-distance/eligibility comparisons rely on ladder position, not raw
  `display_order`).

## Insights

- The lazy `from padel_app.models.coach_levels import CoachLevel` inside
  `get_level_ladder`/`next_display_order` — rather than a top-level import
  — is deliberate: this module has no other dependency on `models`, so
  importing it lazily avoids a circular-import edge from `models` back
  into `services`.
- PAD-70 gotcha: a level with no explicit position (Python default `0`,
  nullable column) previously sorted as the coach's STRONGEST level
  because raw ascending-integer sort treats missing/0 as "first". This
  module exists specifically so no other code compares `display_order`
  directly.
