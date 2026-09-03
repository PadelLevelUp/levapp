---
path: backend/app.py
extracted_at: 2026-09-03T15:00:00Z
extraction_level: 2
size_lines: 26
size_tokens: 153
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "cdba19712508708701ce978f2d0d35260472d3867ddc2480d9c56de22d6b7bca"
---

## Purpose

WSGI/dev-server entrypoint: loads `.env.local.dev` (and `.secrets.env` if present) outside production, builds the app via `padel_app.create_app()`, and, when run directly, serves it threaded on port 80 (comment notes threading is required because SSE connections stay open long-term and would otherwise block the single-threaded dev server). Lines 18-25 are a stray Portuguese-language triple-quoted string sitting at module level after the `if __name__ == "__main__":` block — not a docstring of anything, just dead commentary about an alternate `debug=True` run mode.

## Connections

- Uses: `padel_app` (package `__init__.py`, aliased `as app`); `dotenv.load_dotenv`
- Used by: the process entrypoint — invoked by `flask run` / `python app.py` / the production WSGI server, not imported by any other in-scope module
