"""PAD-693 — the auth rate limiter's shared store, and no server-side sessions (`auth.login` 7, 7a).

`AUTH_RATE_LIMIT_STORE=database` keeps the hits in `auth_rate_limit_hits`, so every process draws
on one budget; the two-process proof is `test_pad693_two_process.py`. These cells pin the store in
one process: the same sliding window and 429 as the memory store, atomic under concurrency, the
prune, the fallback on a non-Postgres database, and fail-open when the store is unreachable.
"""
import logging
import os
import threading

import pytest
from sqlalchemy import text

from padel_app.sql_db import db
from padel_app.utils import rate_limit
from padel_app.utils.rate_limit import limiter_for

ON_POSTGRES = os.getenv("LEVAPP_TEST_DB", "sqlite").strip().lower() == "postgres"
needs_postgres = pytest.mark.skipif(not ON_POSTGRES, reason="the database store needs Postgres")
IP = {"X-Real-IP": "203.0.113.7"}


@pytest.fixture
def db_app(app_with_config):
    app = app_with_config({"AUTH_RATE_LIMIT_STORE": "database", "AUTH_RATE_LIMIT_LOGIN": "3/60"})
    yield app
    limiter_for(app).close()


def _login(client):
    return client.post("/api/auth/login", json={"username": "nobody", "password": "x"}, headers=IP)


def _hits(app):
    with app.app_context():
        return db.session.execute(text("SELECT count(*) FROM auth_rate_limit_hits")).scalar()


# --- rule 7: the store ----------------------------------------------------------------------------

@needs_postgres
def test_database_store_slides_like_the_memory_store(db_app):
    client = db_app.test_client()
    limiter_for(db_app).clock = lambda: 1000.0
    assert [_login(client).status_code for _ in range(3)] == [401, 401, 401]
    res = _login(client)
    assert res.status_code == 429
    body = res.get_json()
    assert body["error"] == "RATE_LIMITED" and 0 < body["retryAfterSeconds"] <= 60
    assert res.headers["Retry-After"] == str(body["retryAfterSeconds"])
    assert _hits(db_app) == 3, "the hits live in the shared table"
    limiter_for(db_app).clock = lambda: 1061.0
    assert _login(client).status_code == 401  # the window slid: served again


@needs_postgres
def test_database_store_never_lets_two_requests_take_the_last_slot(db_app, monkeypatch):
    """Race cell (memory: signal from inside the lock helper). A takes the last slot and pauses
    after counting; B signals from inside `_lock_key`, just before it blocks on A's lock. With the
    lock, B waits for A's commit, counts the slot taken, and is refused. Without it B never
    signals, counts zero while A is paused, and both get in — red on every run, not by timing."""
    limiter = limiter_for(db_app)
    store = limiter.store
    limiter.clock = lambda: 5000.0
    a_counted, b_at_lock = threading.Event(), threading.Event()
    real_count, real_lock = store._count, store._lock_key

    def count(conn, args):
        result = real_count(conn, args)
        if threading.current_thread().name == "A":
            a_counted.set()
            b_at_lock.wait(1.5)  # with the lock B is at it; the mutant never signals
        return result

    def lock_key(conn, args):
        if threading.current_thread().name == "B":
            b_at_lock.set()
        return real_lock(conn, args)

    monkeypatch.setattr(store, "_count", count)
    monkeypatch.setattr(store, "_lock_key", lock_key)
    results = {}

    def a():
        results["A"] = limiter.check("login", "198.51.100.9", 1, 60)

    def b():
        assert a_counted.wait(5)
        results["B"] = limiter.check("login", "198.51.100.9", 1, 60)

    threads = [threading.Thread(target=a, name="A"), threading.Thread(target=b, name="B")]
    for t in threads:
        t.start()
    for t in threads:
        t.join(10)
    assert results["A"] == 0, "A took the last slot"
    assert results["B"] > 0, "B got in too: two requests shared the last slot"


@needs_postgres
def test_database_store_prunes_hits_older_than_the_longest_window(db_app):
    limiter = limiter_for(db_app)
    with db_app.app_context():
        db.session.execute(text(
            "INSERT INTO auth_rate_limit_hits (scope, key, hit_at) VALUES "
            "('login', 'a', 1000), ('login', 'b', 4000), ('login', 'c', 4700)"
        ))
        db.session.commit()
    limiter.store.prune(now=5000.0)
    with db_app.app_context():
        keys = db.session.execute(text("SELECT key FROM auth_rate_limit_hits ORDER BY key")).scalars().all()
    assert keys == ["b", "c"]


@needs_postgres
def test_an_unreachable_store_serves_the_request_and_warns(db_app, monkeypatch, caplog):
    def broken(*args, **kwargs):
        raise RuntimeError("store down")

    monkeypatch.setattr(limiter_for(db_app).store, "check", broken)
    with caplog.at_level(logging.WARNING, logger="padel_app.utils.rate_limit"):
        assert _login(db_app.test_client()).status_code == 401
    assert any("auth rate limit store unavailable" in r.getMessage() for r in caplog.records)


@pytest.mark.skipif(ON_POSTGRES, reason="the fallback is for a non-Postgres database")
def test_database_store_falls_back_to_memory_without_postgres(app_with_config, caplog):
    with caplog.at_level(logging.WARNING, logger="padel_app.utils.rate_limit"):
        app = app_with_config({"AUTH_RATE_LIMIT_STORE": "database"})
        limiter = limiter_for(app)
    assert isinstance(limiter.store, rate_limit.MemoryStore)
    assert sum("falls back to memory" in r.getMessage() for r in caplog.records) == 1


def test_default_store_is_memory(app):
    assert isinstance(limiter_for(app).store, rate_limit.MemoryStore)


# --- rule 7a: no server-side session --------------------------------------------------------------

def test_the_app_has_no_server_side_session_store(app):
    from flask.sessions import SecureCookieSessionInterface

    assert type(app.session_interface) is SecureCookieSessionInterface
    assert "SESSION_TYPE" not in app.config


def test_no_login_sets_a_session_cookie(app, client):
    from werkzeug.security import generate_password_hash

    from padel_app.models import User

    app.config["JWT_SECRET_KEY"] = "test-jwt-secret"
    with app.app_context():
        db.session.add(User(name="Ana", username="pad693_ana", email="pad693@example.com",
                            password=generate_password_hash("OldPass123"), status="active"))
        db.session.commit()
    res = client.post("/api/auth/login", json={"username": "pad693_ana", "password": "OldPass123"})
    assert res.status_code == 200, res.get_json()
    assert not [c for c in res.headers.getlist("Set-Cookie") if c.startswith("session=")]
