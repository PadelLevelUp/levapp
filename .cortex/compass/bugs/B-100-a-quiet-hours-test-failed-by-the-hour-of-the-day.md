---
id: B-100
title: "A quiet-hours test seeded its class off the real clock and failed between 00:00 and 08:00 club-local"
type: test-defect
severity: medium
status: resolved
affects:
  - backend/padel_app/tests/test_pad331_late_arrivals_are_asked.py
proposed_fix: "Pin the class relative to the test's own pinned 'now' (night + 34 h), never to the real clock."
opened: 2026-09-17T00:08:00Z
resolved: 2026-09-17T00:12:00Z
---

# B-100 — A quiet-hours test seeded its class off the real clock and failed by the hour of the day

**Source:** the batch-3 integrator, 2026-09-17 00:05 UTC: `test_pad331_late_arrivals_are_asked
::test_quiet_hours_defer_to_the_morning_and_never_to_a_past_time` failed identically on clean
`origin/staging`. Reproduced by Session B at 00:10 UTC (inside the window). Bug number from
Session B's reserved range (B-100).

**What happened:** the test pins "now" to tomorrow 02:00 (quiet hours) but seeds the class
through `_world(app, hours=24)`, i.e. at REAL now + 24 h. Between roughly 00:00 and 08:00
club-local that class lands at or before the deferred morning slot, `next_ask_time()` rightly
returns `None` (nothing to ask before a class that has started), and the assertion "quiet hours
defer the ask, they do not cancel it" trips. Daytime runs never saw it.

**Root cause:** the fixture's clock and the assertion's clock were different clocks. A test
that pins `now` must pin everything it compares against `now` to the same instant.

**Fix:** after pinning `night`, the test sets the instance's start to `night + 34 h` (midday
the day after) and its end an hour later, so the deferred ask (~08:00 the next morning) is
always before the class, whatever the wall-clock. Test-only; production code untouched.

### Resolution
- Tests modified: `test_pad331_late_arrivals_are_asked.py` (one test)
- Ran at 00:10 UTC: red before (`assert None is not None`), the file 7 passed after.
