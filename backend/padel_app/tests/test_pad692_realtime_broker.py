"""PAD-692 — the Postgres LISTEN/NOTIFY broker inside one process (`messaging.sse-realtime` 20-24).

Cross-process delivery lives in `test_pad692_two_process.py`. These cells pin what one process
can show: the fallback on a non-Postgres database, a publish deferred inside a unit of work, a
publish that cannot stall a request, the prune, and delivery in notify (commit) order.
"""
import json
import logging
import os
import queue
import time

import pytest
from sqlalchemy import text

from padel_app import realtime
from padel_app.sql_db import db

ON_POSTGRES = os.getenv("LEVAPP_TEST_DB", "sqlite").strip().lower() == "postgres"
needs_postgres = pytest.mark.skipif(not ON_POSTGRES, reason="LISTEN/NOTIFY needs Postgres")


@pytest.fixture(autouse=True)
def _clean_realtime():
    realtime._subscribers.clear()
    yield
    realtime.shutdown()
    realtime._subscribers.clear()


@pytest.fixture
def pg_app(app_with_config):
    return app_with_config({"SSE_BROKER": "postgres"})


def _rows(app):
    with app.app_context():
        return db.session.execute(text("SELECT user_ids, body FROM realtime_events ORDER BY id")).all()


# --- rule 20 ------------------------------------------------------------------------------------

@pytest.mark.skipif(ON_POSTGRES, reason="the fallback is for a non-Postgres database")
def test_postgres_broker_falls_back_to_memory_without_postgres(app_with_config, caplog):
    with caplog.at_level(logging.WARNING, logger="padel_app.realtime"):
        app = app_with_config({"SSE_BROKER": "postgres"})
    assert realtime.broker_status()["broker"] == "memory"
    assert sum("falls back to memory" in r.getMessage() for r in caplog.records) == 1

    q = realtime.subscribe(5)
    with app.app_context():
        realtime.publish({"type": "notify_sent", "payload": {}}, [5])
    assert q.get_nowait() == {"type": "notify_sent", "payload": {}}


def test_unknown_broker_value_is_memory(app_with_config):
    app_with_config({"SSE_BROKER": "redis"})
    assert realtime.broker_status()["broker"] == "memory"


# --- rule 21 ------------------------------------------------------------------------------------

@needs_postgres
def test_publish_inside_unit_of_work_waits_for_the_commit(pg_app):
    from padel_app.tools.unit_of_work import unit_of_work

    seen_inside = None
    with pg_app.app_context():
        with unit_of_work():
            realtime.publish({"type": "notify_sent", "payload": {"n": 1}}, [9])
            seen_inside = len(_rows(pg_app))
    assert seen_inside == 0, "a publish inside a unit of work reached the broker before the commit"
    rows = _rows(pg_app)
    assert len(rows) == 1 and json.loads(rows[0].user_ids) == [9]


@needs_postgres
def test_publish_inside_a_rolled_back_unit_of_work_publishes_nothing(pg_app):
    from padel_app.tools.unit_of_work import unit_of_work

    with pg_app.app_context():
        with pytest.raises(RuntimeError):
            with unit_of_work():
                realtime.publish({"type": "notify_sent", "payload": {}}, [9])
                raise RuntimeError("boom")
    assert _rows(pg_app) == []


@needs_postgres
def test_publish_outside_unit_of_work_writes_row_on_its_own_transaction(pg_app):
    """A publish after the caller's commit must not ride the request session: teardown's
    session.remove() would roll it back (design §0.1)."""
    event = {"type": "message_created", "payload": {"id": 1, "content": "x"}}
    with pg_app.app_context():
        realtime.publish(event, [3, 4])
        db.session.rollback()  # what teardown does to anything left on the session
    rows = _rows(pg_app)
    assert len(rows) == 1
    assert rows[0].body == json.dumps(event)
    assert sorted(json.loads(rows[0].user_ids)) == [3, 4]


@needs_postgres
def test_publish_never_stalls_when_its_pool_is_exhausted(pg_app, caplog):
    engine = realtime._publish_engine()
    held = [engine.connect() for _ in range(engine.pool.size() + engine.pool._max_overflow)]
    try:
        with pg_app.app_context(), caplog.at_level(logging.WARNING, logger="padel_app.realtime"):
            started = time.monotonic()
            realtime.publish({"type": "notify_sent", "payload": {}}, [1])
            elapsed = time.monotonic() - started
    finally:
        for conn in held:
            conn.close()
    assert elapsed < 2.5
    assert any("realtime publish dropped" in r.getMessage() for r in caplog.records)


# --- rule 23 ------------------------------------------------------------------------------------

def test_rows_are_delivered_in_notify_order_not_id_order():
    rows = [(3, "[1]", '{"n": 3}'), (5, "[1]", '{"n": 5}')]
    assert [r[0] for r in realtime._in_arrival_order([5, 3], rows)] == [5, 3]


def test_an_id_whose_row_is_gone_is_skipped():
    rows = [(5, "[1]", '{"n": 5}')]
    assert [r[0] for r in realtime._in_arrival_order([4, 5], rows)] == [5]


@needs_postgres
def test_listener_delivers_to_local_streams_with_scoping(pg_app):
    q_u = realtime.subscribe(1)
    q_v = realtime.subscribe(2)
    realtime.ensure_listener()
    assert _wait(lambda: realtime.broker_status()["listening"], 10)
    # Both streams were open before the first LISTEN, so each is told to resync first.
    assert q_u.get(timeout=1) == {"type": "resync"}
    assert q_v.get(timeout=1) == {"type": "resync"}

    event = {"type": "message_created", "payload": {"id": 9}}
    with pg_app.app_context():
        realtime.publish(event, [1])
    assert q_u.get(timeout=2) == event
    with pytest.raises(queue.Empty):
        q_v.get(timeout=0.5)


# --- rule 24 ------------------------------------------------------------------------------------

@needs_postgres
def test_prune_keeps_only_rows_inside_the_retention(pg_app):
    with pg_app.app_context():
        db.session.execute(text(
            "INSERT INTO realtime_events (user_ids, body, created_at) VALUES "
            "('[1]', '{}', now() - interval '11 minutes'), ('[1]', '{}', now() - interval '5 minutes')"
        ))
        db.session.commit()
    realtime.prune_events(retention_minutes=10)
    with pg_app.app_context():
        ages = db.session.execute(text(
            "SELECT extract(epoch FROM now() - created_at) / 60 FROM realtime_events"
        )).scalars().all()
    assert len(ages) == 1 and 4 < ages[0] < 6


def _wait(predicate, timeout):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if predicate():
            return True
        time.sleep(0.05)
    return False


# --- review round 1 (missing-test signals) ------------------------------------------------------

@needs_postgres
def test_a_stream_open_before_the_first_listen_gets_a_resync(pg_app, monkeypatch):
    """The first stream starts the listener, so it is registered before LISTEN returns; an event
    published in that window reaches nobody. The stream must be told to resync (rule 24)."""
    import threading

    gate = threading.Event()
    real_connect = realtime._Listener._connect

    def slow_connect(self):
        gate.wait(10)  # only the listener waits; the publish pool connects as usual
        return real_connect(self)

    monkeypatch.setattr(realtime._Listener, "_connect", slow_connect)
    q = realtime.subscribe(1)  # starts the listener, which now waits at connect
    with pg_app.app_context():
        realtime.publish({"type": "notify_sent", "payload": {}}, [1])  # nobody is LISTENing yet
    gate.set()
    assert q.get(timeout=5) == {"type": "resync"}


@needs_postgres
def test_a_failing_prune_does_not_reconnect_or_resync(pg_app, monkeypatch, caplog):
    monkeypatch.setattr(realtime, "_PRUNE_SQL", "DELETE FROM realtime_events_no_such_table")
    q = realtime.subscribe(1)
    assert _wait(lambda: realtime.broker_status()["listening"], 10)
    q.get(timeout=1)  # the first-LISTEN resync (previous cell)
    with caplog.at_level(logging.WARNING, logger="padel_app.realtime"):
        time.sleep(2.5)
    with pytest.raises(queue.Empty):
        q.get_nowait()
    assert realtime.broker_status()["listening"]
    assert not any("connection lost" in r.getMessage() for r in caplog.records)


@needs_postgres
def test_listener_survives_file_descriptors_above_fd_setsize(pg_app):
    """A busy process holds hundreds of sockets; `select.select` refuses a descriptor >= 1024."""
    import resource

    soft, hard = resource.getrlimit(resource.RLIMIT_NOFILE)
    want = 1400
    if soft < want:
        if hard != resource.RLIM_INFINITY and hard < want:
            pytest.skip(f"RLIMIT_NOFILE hard limit {hard} < {want}")
        resource.setrlimit(resource.RLIMIT_NOFILE, (want, hard))
    pipes = []
    try:
        while not pipes or pipes[-1][1] < 1100:
            pipes.append(os.pipe())
        q = realtime.subscribe(1)
        assert _wait(lambda: realtime.broker_status()["listening"], 10)
        q.get(timeout=1)  # first-LISTEN resync
        event = {"type": "notify_sent", "payload": {"n": 1}}
        with pg_app.app_context():
            realtime.publish(event, [1])
        assert q.get(timeout=3) == event
    finally:
        realtime.shutdown()
        for r, w in pipes:
            os.close(r)
            os.close(w)
        resource.setrlimit(resource.RLIMIT_NOFILE, (soft, hard))


@needs_postgres
def test_stopping_the_listener_never_holds_up_a_publish(pg_app, monkeypatch):
    import threading

    realtime._publish_engine()
    realtime.ensure_listener()
    real_stop = realtime._Listener.stop

    def slow_stop(self):
        time.sleep(3)
        real_stop(self)  # really stop it: a listener left running outlives the test database

    monkeypatch.setattr(realtime._Listener, "stop", slow_stop)
    stopper = threading.Thread(target=realtime.shutdown)
    stopper.start()
    time.sleep(0.2)
    started = time.monotonic()
    realtime._publish_engine()
    assert time.monotonic() - started < 1
    stopper.join()


def test_listener_dsn_keeps_every_query_option():
    dsn = realtime._listener_dsn(
        "postgresql+psycopg2://u:p%40ss@db:5433/levapp?sslmode=require&connect_timeout=5"
    )
    assert dsn.startswith("postgresql://u:p%40ss@db:5433/levapp?")
    assert "sslmode=require" in dsn and "connect_timeout=5" in dsn


@needs_postgres
def test_a_notify_that_arrives_during_a_listener_query_is_not_delayed(pg_app, monkeypatch):
    """psycopg2 files a notification that arrives during a query into `conn.notifies`; the socket
    is then no longer readable, so a listener that waits in select first sleeps the full poll
    interval (seen once in the harness: 4.7 s). The prune runs right after LISTEN; hold it 1.5 s."""
    monkeypatch.setattr(realtime, "_PRUNE_SQL", "SELECT pg_sleep(1.5) -- %(m)s")
    monkeypatch.setattr(realtime, "LISTEN_POLL_SECONDS", 30)
    q = realtime.subscribe(1)
    assert _wait(lambda: realtime.broker_status()["listening"], 10)
    q.get(timeout=1)  # the first-LISTEN resync
    event = {"type": "notify_sent", "payload": {"n": 2}}
    started = time.monotonic()
    with pg_app.app_context():
        realtime.publish(event, [1])  # lands while the prune holds the connection
    assert q.get(timeout=10) == event
    assert time.monotonic() - started < 3
