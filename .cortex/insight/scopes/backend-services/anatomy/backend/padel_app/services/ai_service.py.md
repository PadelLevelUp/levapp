---
path: backend/padel_app/services/ai_service.py
extracted_at: 2026-09-03T13:58:46Z
extraction_level: 3
size_lines: 914
size_tokens: 9347
centrality: high
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "fe357c00c10e4ecf19b1d87555183fddce0188a57a01405a5d6e60cae7b41f7e"
---

## Purpose

The LLM-assisted Excel-import analysis pipeline: turns an arbitrary
coach spreadsheet into the seven importable tables (Players, Classes,
Players in Classes, Presences, Evaluations, Strengths, Weaknesses) plus
two auto-derived ones (Coach Levels, Evaluation Categories), streamed to
the client as SSE progress events. Design principle stated in the module
docstring: the LLM handles ambiguous tasks (column mapping, level/name
matching), while every business rule (dedup, defaulting, type coercion,
referential validity against already-known players/classes) is enforced
deterministically in plain-Python validators — the LLM's output is never
trusted directly into the DB shape.

## Main players

- `CategoryRegistry` (lines 76–132) — critical. Single source of truth
  for evaluation-category dedup across the whole run: normalizes,
  fuzzy-matches (`fuzzy_match_category`), and merges category names
  discovered from three different sources (an explicit "Evaluation
  Categories" sheet, LLM-inferred pivot columns, and raw evaluation rows)
  into one canonical list.
- `_infer_column_mapping` / `_process_segment` (lines 154–295) — critical.
  The LLM call site: profiles a table segment's columns (up to 15 sample
  values each), asks the LLM to map columns to one of the seven target
  tables (STANDARD flat mapping or PIVOT mapping for score-matrix
  sheets), then `_apply_standard_mapping`/`_apply_pivot_mapping` turn
  that mapping into rows deterministically.
- `_map_coach_levels` (lines 303–342) — supporting. LLM-assisted mapping
  of arbitrary Excel level labels ("Iniciacao") onto the coach's existing
  `CoachLevel` codes ("INI") by meaning; results are filtered to ONLY
  codes that actually exist in the DB (`existing_codes`), so a
  hallucinated code can never leak through.
- `_validate_players` / `_validate_classes` / `_validate_presences` /
  `_validate_evaluations` / `_validate_players_in_classes` /
  `_validate_player_linked` (lines 353–574) — critical. The deterministic
  business-rule layer: name-based player dedup (merges duplicate rows,
  preferring the first non-empty value per column), side-value
  normalization to a closed enum, class time defaulting/inference
  (`_infer_end_time`, always +1h30 when only a start time exists),
  presence-status normalization with "empty status = absent" as a
  deliberate rule, and drop-with-count semantics for anything that fails
  cross-referential checks (unknown player name, unknown class title).
- `_validate_names_with_llm` / `_discover_players` (lines 577–601) —
  supporting. A second, narrower LLM call: given player names referenced
  in Presences/Evaluations/Strengths/Weaknesses/Players-in-Classes that
  are NOT already in the Players sheet, asks the LLM to filter out data
  errors from real names, then synthesizes minimal Player rows for the
  survivors so they aren't silently dropped from the import.
- `_build_lesson_instances` (lines 604–673) — critical. Groups raw
  Presence rows by `(date, start_time)`, matches each group against
  already-known classes by the same key, and for unmatched groups uses
  an LLM call to generate human-readable titles ("Academy Class
  2025-03-15 09:00-10:00") sized by headcount (1-2→Private, 3-4→Small
  Group, 5+→Academy) — falling back to `_fallback_title` (deterministic,
  no LLM) if the LLM call fails outright.
- `ImportPipeline` (lines 694–833) — critical. Explicit-state orchestrator:
  one method per pipeline stage (`parse`, `filter_sheets`,
  `detect_segments`, `map_segments`, then one `validate_*` per target
  table), holding `analysis` (clean output rows per table), `drop_counts`,
  `level_mapping`, and `known_players`/`known_classes` (rebuilt after
  every stage that can add new players/classes, since later stages'
  referential checks depend on the CURRENT known set, not the original
  one).
- `stream_import_analysis` (lines 841–913) — critical, the public entry
  point. Drives the whole pipeline as an SSE generator, yielding
  `phase`/`thinking`/`progress`/`tables`/`done`/`error` events at each
  stage so the frontend can render live import progress; wraps the
  entire pipeline in a broad `except Exception` that still yields a
  well-formed `error` event rather than crashing the stream mid-flight.

## Insights

- Validation stage ORDER is load-bearing, not incidental:
  `validate_players` must run before `validate_presences`/
  `validate_evaluations` (both filter against `known_players`), and
  `validate_classes` before `validate_presences` (matches by
  `(day, start_time)` key against already-known classes) —
  `validate_presences` can itself CREATE new classes
  (`_build_lesson_instances`) and stamp `lesson_title` onto each presence
  row, which is why `revalidate_players_in_classes` runs a SECOND time
  after presences, against the now-larger `known_classes` set.
- Every dropped row is counted (`drop_counts`), never silently discarded
  — `stream_import_analysis` surfaces the total and per-table breakdown
  to the client so a coach can tell "12 evaluation rows imported, 3
  dropped for unknown player" rather than seeing an unexplained shortfall.
- `_process_segment` and `map_segments` run ALL segments' LLM column-
  mapping calls concurrently via `ThreadPoolExecutor` (capped at 4
  workers) — a per-segment failure is caught and logged individually
  (`except Exception: logger.exception(...)`) rather than aborting the
  whole import; one bad sheet segment doesn't sink the rest.
- `CategoryRegistry.register`'s fuzzy-match dedup means category names
  are merged by SIMILARITY, not exact string equality — the class-level
  design decision (fuzzy matching over exact matching) shows up again in
  `_validate_evaluations`, which canonicalizes an evaluation row's
  category name through the SAME registry before accepting the row.
- `_validate_presences`'s "empty status = absent" rule (line ~486) is a
  business assumption baked into the importer, not a general Presence
  semantics rule elsewhere in the codebase — a spreadsheet row present
  for a class but with a blank status cell is interpreted as an
  unmarked absence, not skipped.
- `stream_import_analysis` re-derives its own SSE frame format inline
  (`_ev`, a local closure) rather than importing a shared SSE helper —
  this module's streaming is independent of `realtime.py`'s
  publish/subscribe fan-out (which is for cross-request real-time
  events, not a single synchronous import job's own response stream).

## Connections

- Uses: `padel_app.helpers.llm` (`call_llm`, `log_timing`, `logger`,
  `parse_json` — outside this scope); `padel_app.helpers.parsing`
  (`TableSegment`, `detect_table_segments`, `parse_excel`,
  `pick_relevant_sheets` — outside this scope); `padel_app.helpers.text`
  (`clean_text_value`, `deduplicate_rows`, `deep_copy_rows`,
  `fuzzy_match_category`, `has_meaningful_text`, `is_empty`,
  `is_garbage_category`, `is_numeric`, `merge_table_rows`,
  `normalize_date`, `normalize_status`, `normalize_text`, `normalize_time`
  — outside this scope); `services/coach_service.py` (`get_coach_levels`,
  imported lazily inside `ImportPipeline.validate_coach_levels`).
- Used by: `services/import_service.py` presumably invokes
  `stream_import_analysis`'s output shape (not confirmed by import
  statements in either file — `import_service.py` performs the actual
  DB writes for the tables this module only ANALYZES and stages).

## Query pointers

- If you need to add a new importable table or change what the LLM maps
  to, start at `_TABLE_FIELDS` and `ALL_IMPORTABLE_TABLES`, then add a
  matching `validate_<table>` method on `ImportPipeline` and wire it into
  `stream_import_analysis`'s call sequence — mind the ordering
  dependency on `known_players`/`known_classes` noted above.
- If you need to change a validation/business rule (defaulting,
  normalization, dedup), the relevant `_validate_*` free function is
  self-contained and independently testable — no need to touch
  `ImportPipeline` or the LLM prompts.
- If a coach reports rows silently missing from an import, read
  `drop_counts` handling in `stream_import_analysis` and the specific
  `_validate_*` function for that table — every drop path increments a
  counter, so the cause is traceable from the SSE `thinking` events the
  frontend already received.
