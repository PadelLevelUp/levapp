---
path: backend/padel_app/tests/helpers.py
extracted_at: 2026-09-03T00:00:00Z
extraction_level: 3
size_lines: 28
size_tokens: 168
centrality: high
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "c775be04244e096408d1a2d2993e65b0c1144d2e7fca8779a78a3e56d15cc338"
---

## Purpose

A single shared test helper, `make_coach`, that creates a minimal
`User` + `Coach` pair in the test DB and returns the `coach_id`. Exists so
tests that just need "a coach exists" don't each hand-roll the two-row
setup.

## Main players

- `make_coach(app) -> int` (lines 7-27) — critical (the only export).
  Opens its own `app.app_context()`, creates a `User` (name "Test Coach
  Helper", username "test_coach_helper", password "testpass123"), flushes
  to get an id, creates a `Coach(user_id=user.id)`, commits, and returns
  `coach.id`. Docstring calls it "idempotent within a single app context"
  but it is not idempotent across calls within the SAME app/db — calling
  it twice against the same seeded DB would raise a duplicate-username
  constraint; "idempotent" here means safe to call once per fresh
  fixture-scoped app, which is the only way it's actually used.

## Insights

- Model imports (`User`, `Coach`) are done lazily inside the function body,
  matching the pattern established in `conftest.py` — imported after
  `app.app_context()` is available rather than at module top.
- Because the username is hardcoded (`"test_coach_helper"`), tests that
  call `make_coach` more than once against the same app/db (or combine it
  with another fixture that also seeds that username) will collide; the
  scope's other files avoid this by generating unique suffixes for
  usernames in their own local `_make_coach`-style helpers instead of
  reusing this one when they need more than one coach.

## Connections

- Uses: `padel_app.sql_db` (`db`), `padel_app.models` (`User`),
  `padel_app.models.coaches` (`Coach`) — the model imports are internal to
  the function body and not visible to L1 static import extraction.
- Used by: `test_backend_500_fixes.py` (`test_exercises_endpoint_still_works_for_coach`,
  `test_exercise_groups_endpoint_still_works_for_coach`) and
  `test_generic_crud_auth.py` — both import
  `from padel_app.tests.helpers import make_coach` to get a quick coach
  fixture without repeating the User+Coach boilerplate.

## Query pointers

- If you need "just a coach, nothing else" in a new test, call
  `make_coach(app)` rather than duplicating the User+Coach seed.
- If you need more than one coach, or a coach with a specific username/
  club, write a local `_make_coach` in the test file instead — this
  helper's hardcoded username makes it unsuitable for multi-coach
  scenarios.
