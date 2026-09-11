---
id: B-070
title: "The AI import analysis streams outside the request context, so the coach's existing levels are silently ignored"
type: incomplete-rule
severity: medium
status: triaged
affects:
  - import.analyze
  - backend/padel_app/modules/frontend_api.py
  - backend/padel_app/services/ai_service.py
proposed_fix: "Read the coach's level ladder in the view, inside the request context, and inject it into the pipeline; nothing inside the stream touches the database, and the lookup no longer swallows exceptions."
opened: 2026-09-11T13:35:00Z
---

# B-070 — The AI import analysis streams outside the request context, so the coach's existing levels are silently ignored

**Source:** Session G's PAD-291 sweep for sessions that outlive their context (2026-09-11).
Ticket PAD-293.

**What happens:** `import_analyze()` returns `Response(stream_import_analysis(...))` — a plain
generator, no `stream_with_context`. Flask's `wsgi_app` pops the request (and app) context in
its `finally` before the WSGI server iterates the body, so the whole analysis runs with no
context. Its one database read, `get_coach_levels(coach_id)` in
`ImportPipeline.validate_coach_levels`, raises `RuntimeError: No application found…`, which the
method catches and downgrades to `logger.warning("[AI] Could not fetch coach levels")` with
`existing = []`. `_map_coach_levels` then returns nothing, the "Coach Levels" table never appears
in the `tables` event, and every `level_code` in the spreadsheet is passed through unmapped —
the import behaves as if the coach had no levels, with no error reaching the user.

**Reproduced** with `backend/padel_app/tests/test_pad293_import_analyze_context.py` on staging
72ac170a8: a coach with levels ADV/INI uploads a sheet whose players are "Iniciacao"; the
stream carries no "Coach Levels" table and the warning above is logged (the Flask test client
iterates the body after the context pops, exactly as gunicorn does). A second defect sat behind
the first: `_map_coach_levels` reads `l.get("code")`, but `get_coach_levels` returns `CoachLevel`
rows, which have no `.get` — had the lookup ever succeeded, the analysis would have ended in an
`error` event instead.

**Root cause (type 2):** `import.analyze` describes the stream and its events but has no rule
about what the analysis may read while streaming, nor that the spreadsheet's level values map
onto the coach's existing ladder. Nothing said "no database inside the stream".

**Affected specs:**
- Dev: `.specflow/specs/import/analyze.spec.md`
- Business: `coach-imports-a-roster-spreadsheet.business.md` — still true (the coach's data
  is matched against what they already have); no change.

### Change Plan

**Spec to modify:** `.specflow/specs/import/analyze.spec.md` — add rule 7 (unconfirmed number)
and one criterion: the analysis maps spreadsheet level values onto the coach's existing levels;
everything it needs from the database is read in the request, before the stream starts, and a
failed read is an error response, never a warning.

**Then:**
1. Test: `test_pad293_import_analyze_context.py` (red: `[] == ['INI']`).
2. `frontend_api.import_analyze`: `existing_levels = [{"code", "label"} …]` from
   `get_coach_levels(coach.id)` inside the view, passed to `stream_import_analysis`.
3. `ai_service`: `stream_import_analysis(..., existing_levels=None)` → `ImportPipeline`
   stores them; `validate_coach_levels` uses them, no import, no try/except, no DB.
4. Regression: SQLite suite; Postgres on the touched files.

### Resolution

(pending — PAD-293)
