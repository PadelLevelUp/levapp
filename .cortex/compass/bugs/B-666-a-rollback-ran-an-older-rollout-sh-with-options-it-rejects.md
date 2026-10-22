---
id: B-666
title: "deploy-prod's rollback_to runs the rollback commit's rollout.sh with the current workflow's options; every rollout.sh before #769 exits 2 on --probe-host (and before #753 on --migrate)"
type: incomplete-rule
severity: high
status: resolved
affects:
  - .github/workflows/deploy-prod.yaml
  - .github/workflows/deploy-staging.yaml
proposed_fix: "Each workflow passes an option only when the checked-out rollout.sh accepts it, logging the ones it drops; a test runs the workflow's real lines against the rollout.sh of 0ee4e837d."
opened: 2026-10-22T01:45:00Z
---

# B-666: a rollback could not run

**Source:** la-2110-SessionF, answering the deploy-watch session's rollback question for the
promotion (2026-10-22). Found by reading, not by a failed rollback.

**Mechanism:** deploy-prod.yaml checks out `ref: rollback_to` (PAD-338), so `rollout.sh` and
`.env.prod` come from the rollback commit. The ssh script's lines, though, come from the workflow
at main. #769 (B-664) made those lines pass `--probe-host`, and #753 (PAD-691) `--migrate`. The
`rollout.sh` at 0ee4e837d (promotion 16, the last prod deploy before both) knows neither, and its
argument loop exits 2 on `unknown option`. Once #769 reached prod, every rollback to a commit before
it would have stopped there. That is safe (nothing touched), but no rollback.

**Fix:** both deploy workflows define `opt()`, which passes an option only when the checked-out
`rollout.sh` has a `    <option>)` case, and logs `this rollout.sh has no <option>: not passing
it` when it drops one. `test_b666_rollback_runs_the_old_rollout.py` runs each workflow's real
`opt` line and invocation against the 0ee4e837d `rollout.sh`, which then rolls, and against the
current one (every option passed). It also shows the old script still rejects the options when
called directly (the 2×2's other half).

**Limit that no workflow change fixes, for the promotion body:** an image from before #753 runs
`flask db upgrade` in its own entrypoint (0ee4e837d's `entrypoint.sh` line 5). After a release
that adds a migration (#758 PAD-692's `realtime_events`, #764 PAD-693's rate-limit table), that
image cannot read the database's newer revision: its upgrade fails, the container restarts, and
the rolling deploy removes it while the current one keeps serving. So rolling back across a
migration to a pre-#753 image fails safely, but it fails. From the first release that contains
#753 on, a rollback works across expand-only migrations: the image boots with "schema ahead"
(zero-downtime-deploy rules 9–12).
