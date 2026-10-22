---
id: B-676
title: "INFO lines from padel_app.realtime never reach the container logs: the stats line and 'LISTEN ready' are invisible"
type: test-defect
severity: medium
status: triaged
affects:
  - messaging.sse-realtime
  - backend/padel_app/realtime.py
  - backend/padel_app/tests/test_pad689_stream_observability.py
proposed_fix: "create_app sets the padel_app package logger to INFO (root stays WARNING), widened from padel_app.realtime only on the architecture review; cells built without caplog assert INFO for the package, realtime and a sibling module, and after an in-process Alembic run."
opened: 2026-10-22T01:35:00Z
---

# B-676: the realtime INFO lines are dropped by the root WARNING level

**Source:** PAD-692 staging window, 2026-10-22 01:12–01:25Z (la-2110-SessionG). Ledger id from
range B-676–690 (unconfirmed).

**What happens:** on staging image 720eeb01e, `docker logs padelapp_staging` held 0
`realtime listener: LISTEN ready` lines and 0 `SSE streams:` lines through the window, while
`pg_stat_activity` showed the listener connected (`application_name=levapp-realtime-listener`,
1 row at T+2 and at T+12). WARNING lines from the same app did reach the log (14 in two hours).

**What should happen:** `messaging.sse-realtime` rule 25: every stream-holding process logs one
INFO stats line a minute (PAD-689's "done when": the line appears in prod logs). PAD-695's worker
line and the A3 counters are INFO by design too (architecture, 2026-10-22).

**Evidence (Phase 1):** reproduced in a clean process (no pytest, no caplog) with the real
`create_app`: root level WARNING; `padel_app` and `padel_app.realtime` level NOTSET, effective
WARNING, not disabled. `logger.info(...)` printed nothing; `logger.warning(...)` printed.

**Root cause:** nothing sets a level below the root logger, so every `padel_app.*` INFO record
is dropped at the effective WARNING level. The rule and its criterion are right. The test
(`test_the_stats_line_is_logged_every_interval_in_memory_mode`) wraps the call in
`caplog.at_level(logging.INFO, logger="padel_app.realtime")`, which sets the level itself, so it
can never see the deployed default: type 7, a test that does not encode the deployment.

**Affected specs:**
- Dev: `.specflow/specs/messaging/sse-realtime.spec.md` (rule 25)
- Business: `.specflow/specs-business/messaging/user-and-coach-message-in-real-time.business.md`
  (no change: operations visibility, no user-facing outcome)

### Change Plan

**Spec:** messaging.sse-realtime, rule 25. Add the criterion "The stats line is visible under the
process's default logging" (Given an app built by `create_app` with no logging set up by the
test, Then `padel_app.realtime` has INFO enabled; And it stays enabled after an in-process
Alembic upgrade, which runs `fileConfig`; memory note alembic-fileconfig-disables-existing-loggers).

**Then:**
1. Cells without caplog, red on staging's code (effective WARNING).
2. `realtime.init_app` sets `logging.getLogger("padel_app.realtime").setLevel(logging.INFO)`.
   That logger only, so no other module's volume changes. The logger then propagates to
   whatever handler the process has (Flask's default handler on `padel_app`, gunicorn's stderr).
3. Run the realtime and observability files; the PR reads the line live on staging after deploy.

### Resolution

- Spec changes: sse-realtime rule 25 criterion (this PR)
- Tests: `test_pad689_stream_observability.py` (two cells without caplog)
- Code: `create_app` sets `padel_app` (the package logger, which IS `app.logger`) to INFO; root stays
  WARNING. Widened from `padel_app.realtime` only (architecture review, coordinator go, 2026-10-22):
  32 `logger.info` sites in 10 non-test files, none per request, docker rotation 10m×3. The two
  existing `setLevel` calls (`helpers/llm.py`, `realtime.init_app`) are kept as they are.
