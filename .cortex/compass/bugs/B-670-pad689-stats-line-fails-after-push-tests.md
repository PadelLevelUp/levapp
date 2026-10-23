---
id: B-670
title: "The PAD-689 stats-line test fails after the push test files on SQLite: the line gains outbox_stats_error=OperationalError"
type: test-defect
severity: low
status: open
affects:
  - backend/padel_app/tests/test_pad689_stream_observability.py
proposed_fix: "Bisect the earlier push file that leaves the outbox unreadable, then isolate it (reset the outbox state or the engine), or assert the stats line without the optional error suffix."
opened: 2026-10-23T05:15:00Z
---

# B-670: the PAD-689 stats line breaks when it runs after the push tests

**Source:** la-2110-SessionF, running PAD-745's touched set locally. Linear PAD-749. The type is
unconfirmed until the cause is bisected.

**What happens:** `test_pad689_stream_observability.py::test_the_stats_line_names_streams_busiest_user_cap_and_push_queue`
fails on SQLite when run after the push test files: the stats line ends
` outbox_stats_error=OperationalError`, so the exact-string assertion fails.

**What should happen:** the test passes in any order.

**Evidence:** on unchanged staging 034feab5e, `pytest test_pad294_push_sender_review.py
test_pad699_push_outbox.py test_pad534_engine_health.py test_b254_no_addresses_in_logs.py
test_pad294_push_sender.py test_pad689_stream_observability.py test_pad680_notification_sound.py
test_pad307_android_push_prep.py test_pad624_staging_sends_no_expo_push.py test_native_push.py`
gives 1 failed, 124 passed. The test alone passes. Not reproduced on Postgres or in CI's group order.

**Root cause:** not yet found. A hypothesis only: an earlier file leaves the outbox's stats query
failing on SQLite (a lock held by a short `engine.begin()` connection, or a table rebuilt). The stats
line catches the error and appends it.

### Change plan
1. Bisect the earlier file.
2. Isolate it, or make the assertion ignore the optional suffix.
3. Run the order above again.
