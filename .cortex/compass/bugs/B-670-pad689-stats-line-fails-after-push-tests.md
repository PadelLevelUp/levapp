---
id: B-670
title: "The PAD-689 stats-line test fails after the push test files on SQLite: the line gains outbox_stats_error=OperationalError"
type: test-defect
severity: low
status: resolved
affects:
  - backend/padel_app/tests/test_pad689_stream_observability.py
  - backend/padel_app/tests/conftest.py
  - backend/padel_app/utils/push_outbox.py
proposed_fix: "Reset push_outbox._drainer_app around every test (conftest autouse fixture), so no test reads a finished test's app."
opened: 2026-10-23T05:15:00Z
resolved: 2026-10-23T12:00:00Z
---

# B-670: the PAD-689 stats line breaks when it runs after the push tests

**Source:** la-2110-SessionF, running PAD-745's touched set locally. Linear PAD-749.

**What happens:** `test_pad689_stream_observability.py::test_the_stats_line_names_streams_busiest_user_cap_and_push_queue`
fails on SQLite when run after the push test files: the stats line ends
` outbox_stats_error=OperationalError`, so the exact-string assertion fails.

**What should happen:** the test passes in any order.

**Evidence:** on unchanged staging 034feab5e, `pytest test_pad294_push_sender_review.py
test_pad699_push_outbox.py test_pad534_engine_health.py test_b254_no_addresses_in_logs.py
test_pad294_push_sender.py test_pad689_stream_observability.py test_pad680_notification_sound.py
test_pad307_android_push_prep.py test_pad624_staging_sends_no_expo_push.py test_native_push.py`
gives 1 failed, 124 passed. The test alone passes. Not reproduced on Postgres or in CI's group order.

Bisected on staging 01125fb09: of the earlier files, only `test_pad699_push_outbox.py` breaks it, and
within it each test that builds a `Drainer` does (`test_start_and_stop_are_idempotent`,
`test_a_stopping_drainer_puts_its_claims_back`, `test_the_drainer_follows_the_flag_and_is_one_per_process`).
A probe run after `test_start_and_stop_are_idempotent` found no app context,
`push_outbox._drainer_app` still set to that test's app (`PUSH_QUEUE=outbox`, a temp SQLite file already
unlinked), and `stats()` on it raising `sqlite3.OperationalError: no such table: push_outbox`.

**Root cause:** `Drainer.__init__` records its app in the module global `push_outbox._drainer_app`, so the
realtime monitor's log line can report the outbox outside an app context. Nothing resets it between
tests. `realtime.stats_line()` runs outside an app context in the PAD-689 test, so `stats_fragment()`
takes the `_drainer_app` branch and queries the earlier test's deleted database. On Postgres the test
database outlives the test, so the query succeeds and the leak stays hidden. In production one process
builds its drainer once, on the live app, so it is test isolation only.

The fix belongs in test isolation, not in the stats code: `stats_fragment()` already turns the error into
the suffix, which is the right behaviour for a real failure; treating a missing table as an empty outbox
would hide a misconfigured database.

### Change plan
1. Add a conftest autouse fixture that sets `push_outbox._drainer_app = None` before and after each test,
   beside PAD-593's `_fresh_signed_url_cache`.
2. Run the failing pair and the order above again.

### Resolution
- Spec changes: none (test-defect).
- Tests: `conftest.py` `_no_leftover_drainer_app`.
- Code changes: none.
- Verified: `pytest test_pad699_push_outbox.py::test_start_and_stop_are_idempotent
  test_pad689_stream_observability.py::test_the_stats_line_names_streams_busiest_user_cap_and_push_queue`
  went from 1 failed, 1 passed to 2 passed; the order above went from 1 failed to 130 passed, 1 skipped.
- Resolved: 2026-10-23.
