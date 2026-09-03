---
path: backend/padel_app/helpers/llm.py
extracted_at: 2026-09-03T15:00:00Z
extraction_level: 2
size_lines: 104
size_tokens: 893
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "0bd20481a4cde461aeb02cf51dafc544193a69e9796c6a33d6faacdeb18aadd6"
---

## Purpose

Thin OpenAI-compatible LLM client wrapper for the AI-driven data-import feature: `call_llm` calls the configured model (via OpenRouter, defaulting to `inception/mercury-2`) with up to 2 retries and exponential backoff, raising immediately on auth/type/value errors instead of retrying them; `parse_json` validates and parses the model's response as a JSON object, raising a descriptive `ValueError` on malformed output; `log_timing` is a shared perf-logging helper used by this file and its callers.

## Connections

- Uses: `openai` SDK (`OpenAI`, `AuthenticationError`); reads `OPENROUTER_BASE_URL`/`OPENROUTER_API_KEY`/`OPENAI_API_KEY`/`OPENROUTER_MODEL`/`OPENROUTER_REASONING_ENABLED` from the environment at import time
- Used by: `padel_app/helpers/parsing.py` (same scope) for LLM-assisted sheet filtering; `padel_app/services/ai_service.py` (outside this scope) — the main entry point for the Excel-import AI pipeline
