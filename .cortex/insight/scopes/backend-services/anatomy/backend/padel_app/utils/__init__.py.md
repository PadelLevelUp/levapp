---
path: backend/padel_app/utils/__init__.py
extracted_at: 2026-09-03T13:58:46Z
extraction_level: 2
size_lines: 5
size_tokens: 60
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "8b5be2d25d5151221bd0ccbee7ca705c97e5d0caa5348c61d1effd588dceb76f"
---

## Purpose

Package marker for `padel_app.utils`, carrying only a stale comment
block (labeled "Audit findings (Phase 1)") that records early
orientation notes about messaging routing, SSE, and auth — not live
documentation of current behavior. No executable code.

## Connections

- Used by: every module under `padel_app/utils/` (implicitly, as the
  package they belong to).

## Insights

- The docstring-like comment ("Message creation is handled in
  services/messaging_service.py...") is a leftover audit note, not a
  contract — treat it as historical context, not as current-state
  documentation (compare against `messaging_service.py` and
  `realtime.py` directly for the real behavior).
