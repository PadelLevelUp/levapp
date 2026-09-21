---
id: B-127
title: "Two test files were collected by no runner, so a regression test had never been executed"
type: incomplete-rule
severity: medium
status: resolved
affects:
  - frontend/vitest.packages.config.ts
  - .github/workflows/backend-tests.yaml
  - frontend/packages/hooks/src/useCalendarEvents.test.tsx
  - frontend/apps/web/e2e/scripts/test_seed_dates.py
proposed_fix: "Collect both files, and guard it: a test on each side that enumerates test files on disk and fails if any is collected by zero runners, reading 'collected' from the runners themselves."
opened: 2026-09-21T19:42:00Z
resolved: 2026-09-21T20:01:01Z
---

# B-127 — two test files were collected by no runner

**Source:** Session-C, 2026-09-21 19:42 UTC, checked three ways on a branch whose vitest
configs equal `origin/staging`'s: `frontend/packages/hooks/src/useCalendarEvents.test.tsx` is
collected by no vitest config. The Coordinator widened the question to every runner and lane.
Ticket PAD-383. Ledger number from Session-B's reserved range (B-125–134), unconfirmed.

**What happened.** PAD-348 fixed B-113 and wrote its regression test as a `.test.tsx` in
`packages/hooks`. The packages config included `packages/*/src/**/*.test.ts` only; web collects
its own `src/`, mobile its own `src/` and `app/`. It was the only `.test.tsx` under `packages/`,
so it was never run — by `npm test`, by CI's `unit` job, or by anyone — and B-113 was marked
`resolved` "guarded by" a test that had never executed. Nothing was red, which is the point:
a test that is not collected cannot fail.

The audit found a second one on the backend side: `frontend/apps/web/e2e/scripts/test_seed_dates.py`
(PAD-223 — the E2E seed's dates never collide, whatever the weekday; 10 functions, 122 cases).
CI runs `python -m pytest padel_app/tests`; the file lives beside the seed it tests, and its own
docstring says "Run from the backend venv". Sessions ran it by hand; no lane did.

**Audit (Session-B, 2026-09-21 19:56–20:01 UTC, `origin/staging` `00e53375f`)** — each
runner's own listing against every test-looking file git knows:

| Runner | Instrument | Candidates | Orphans |
|---|---|---|---|
| vitest × 3 | `vitest list --filesOnly --json` per config | 116 | 1 |
| pytest (both CI lanes) | the workflow's pytest command line + pytest's `python_files` | 180 | 1 |
| Maestro | existing guard `apps/mobile/src/lib/maestro-flow-numbers.test.ts` (green in `unit`) | — | covered, not re-derived |
| Playwright | `playwright test --list --reporter=json` (run 2026-09-21T21:34:49Z, once the machine-quiet lifted) | 146 | 0 — 146 listed, 146 on disk |

**The rescued tests, run for the first time by a runner's config:**

- `useCalendarEvents.test.tsx` — 2 passed (19:56 UTC). 2×2: with PAD-348's `enabled` guard
  removed from `queries.ts` the first test **fails** ("expected spy to not be called at all,
  but actually been called 1 times"); restored, 2 passed. The test is real and B-113's fix is
  genuine. No second ticket.
- `test_seed_dates.py` — 122 passed (20:01 UTC).

**Why nothing caught it.** Each runner's include list is a statement about where tests *are*;
nothing stated where tests are *not allowed to hide*. B-092 (no PR check ran vitest at all) was
the same family one level up: a guard that cannot run is not a guard.

**Resolution (PAD-383).**

1. `vitest.packages.config.ts` includes `*.test.{ts,tsx}`; the hook test selects jsdom with its
   own `// @vitest-environment jsdom` pragma, so the packages project stays a Node project.
2. Both pytest lines in `backend-tests.yaml` gain `../frontend/apps/web/e2e/scripts`.
3. Two guards, **one instrument each** — "collected" is read from the runner, never from a second
   copy of its globs; only the candidate side is a pattern, wider than any runner's:
   - `frontend/packages/config/src/every-test-file-is-collected.test.ts` asks the three vitest
     configs what they would run; fails on a test-named file collected by none or by two, and
     if a runner lists nothing (a broken instrument is not a clean result). About one second.
   - `backend/padel_app/tests/test_every_test_file_is_collected.py` reads CI's pytest command
     lines and pytest's own `python_files`; asserts the lanes run the same paths; in a full
     session also checks `session.items` (skipped, rightly, in a single-file run).
   Each was seen **failing on the defect** (old include → names `useCalendarEvents.test.tsx`;
   old workflow → names `test_seed_dates.py`) **and passing on the fix**.

**Playwright became the fourth runner in the frontend guard** (same PR): it is asked what it
lists, exactly like the vitest configs — no server, no browser, about two seconds. One lesson
from validating it: my first mutant, a stray `e2e/zz-stray.test.tsx`, did NOT fail the guard —
because Playwright's default `testMatch` does take `.tsx`, which the name-only check this
replaced had denied in a comment and a regex. A second instrument, and a wrong one. The mutant
that does fail it is a file the candidate pattern flags and Playwright does not list
(`e2e/__tests__/zz-helper.ts`): guard red naming it (21:39:14Z), green once removed (21:39:17Z).

**Not proven here:** the full-session `session.items` check can only run in CI's full
invocation. Adding a runner means adding it to the
guard's `RUNNERS` list — a new vitest config the guard does not know would make its files look
orphaned, which fails loudly, the safe direction.
