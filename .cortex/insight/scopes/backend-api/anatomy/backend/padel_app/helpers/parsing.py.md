---
path: backend/padel_app/helpers/parsing.py
extracted_at: 2026-09-03T15:00:00Z
extraction_level: 2
size_lines: 229
size_tokens: 2191
centrality: medium
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "f5dee0d1990121f540e924ca06de2f7263cd405fe3be7e637b062b17ec40e7f4"
---

## Purpose

Three-stage Excel ingestion pipeline for the AI import feature: `parse_excel` reads a workbook into `{sheet_name: raw_rows}` with size/sheet/row caps (50MB, 50 sheets, 50k rows/sheet) and drops empty sheets; `pick_relevant_sheets` short-circuits to "keep all" at ≤20 sheets, otherwise asks the LLM to select relevant ones for the tables the user wants imported, with a 33% safety floor that falls back to "include everything" if the model is too aggressive; `detect_table_segments`/`TableSegment` heuristically splits a sheet into one or more logical tables (a segment ends on 2+ consecutive blank rows or when a row looks like a fresh header given the preceding rows' types).

## Connections

- Uses: `openpyxl` for workbook parsing; `padel_app/helpers/llm.py`: `call_llm`, `log_timing`, `logger`, `parse_json` for the LLM-assisted sheet-relevance step
- Used by: `padel_app/services/ai_service.py` (outside this scope): imports `parse_excel`, `pick_relevant_sheets`, `detect_table_segments`, `TableSegment` as the first stage of the import-analysis pipeline
