---
path: backend/padel_app/helpers/text.py
extracted_at: 2026-09-03T15:00:00Z
extraction_level: 2
size_lines: 186
size_tokens: 1557
centrality: medium
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "5df9d48d2332c4d8504bfc76c482370a55a004db60d9ae4554c31b2ec5d28b15"
---

## Purpose

Standalone text/data normalisation toolkit backing the Excel import pipeline: accent- and case-insensitive `normalize_text`; row dedup/merge helpers (`deduplicate_rows`, `merge_table_rows`, `deep_copy_rows`) keyed by a sorted-JSON fingerprint; `fuzzy_match_category` (exact-normalized → substring → `SequenceMatcher` ratio ≥0.8) for matching imported category names against known ones; `is_garbage_category` to filter placeholder/numeric column headers; `normalize_date`/`normalize_time` for loose date/time strings; and `normalize_status`, a large bilingual (Portuguese/English) lookup table plus prefix rules mapping attendance shorthand ("p", "presente", "fj", "falta injustificada", etc.) to `(status, justification)` pairs.

## Connections

- Uses: no internal imports — pure stdlib (`re`, `unicodedata`, `difflib.SequenceMatcher`, `copy`, `json`)
- Used by: `padel_app/services/ai_service.py` (outside this scope): imports several of these helpers to clean and reconcile LLM-extracted import rows against existing data
