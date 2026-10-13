"""PAD-652 / B-581: two save-subscription calls at once for one user both succeed and leave ONE row.

Prod, 2026-10-12 12:30Z: the web app saves the subscription twice on sign-in (`login()` and the
token effect both call `requestAndSubscribe`). `save_subscription` looked the row up and then
inserted it, so the call that lost the race failed on `ix_push_subscriptions_user_id` with a 500.

Two cells:
- the loser's path, forced on any database: the lookup is made to miss although the winner's
  row is already there, so the insert collides exactly as the race loser's does;
- the real race, Postgres only (SQLite has one writer, and the loser would fail on "database is
  locked" instead): both requests are held at their `INSERT INTO push_subscriptions` until the
  other has reached its own, so both have already looked and found nothing.

Covers auth.push-subscription rule 7 and "Two saves at once keep one subscription".
"""
import contextlib
import json
import os
import threading

import pytest
from flask_jwt_extended import create_access_token
from sqlalchemy import event

from padel_app.sql_db import db

GATE_SECONDS = 3


@pytest.fixture(autouse=True)
def _jwt_secret(app):
    app.config["JWT_SECRET_KEY"] = "test-jwt-secret"


def _user(app):
    from padel_app.models import User

    with app.app_context():
        user = User(name="Coach", username="pad652-coach", email="pad652@t.test", password="x", status="active")
        db.session.add(user)
        db.session.commit()
        return user.id


def _headers(app, user_id):
    with app.app_context():
        return {"Authorization": f"Bearer {create_access_token(identity=str(user_id))}"}


def _subscription(n):
    return {"endpoint": f"https://push.example.com/ep-{n}", "keys": {"p256dh": "BKxQ_fake_key", "auth": "fake_auth"}}


def _rows(app, user_id):
    from padel_app.models import PushSubscription

    with app.app_context():
        return [json.loads(r.subscription_json) for r in PushSubscription.query.filter_by(user_id=user_id).all()]


def test_a_save_whose_insert_collides_updates_the_winners_row(app, client, monkeypatch):
    """The race loser's path: its lookup found nothing, but the winner's row is there by the insert."""
    from padel_app.models import PushSubscription

    user_id = _user(app)
    headers = _headers(app, user_id)
    assert client.post("/api/notifications/save-subscription", json={"subscription": _subscription(1)}, headers=headers).status_code == 201

    real_filter_by = PushSubscription.query_class.filter_by
    misses = {"left": 1}

    def _first_lookup_misses(self, **kwargs):
        query = real_filter_by(self, **kwargs)
        if kwargs == {"user_id": user_id} and misses["left"]:
            misses["left"] -= 1
            return query.filter(db.false())
        return query

    monkeypatch.setattr(PushSubscription.query_class, "filter_by", _first_lookup_misses)
    resp = client.post("/api/notifications/save-subscription", json={"subscription": _subscription(2)}, headers=headers)

    assert misses["left"] == 0, "the forced miss was never used"
    assert resp.status_code == 201, resp.get_data(as_text=True)
    assert _rows(app, user_id) == [_subscription(2)]


@contextlib.contextmanager
def _both_requests_reach_the_insert(app):
    gate = threading.Barrier(2)

    def _hold(conn, cursor, statement, *_a, **_k):
        if statement.lstrip().upper().startswith("INSERT INTO PUSH_SUBSCRIPTIONS"):
            try:
                gate.wait(timeout=GATE_SECONDS)
            except threading.BrokenBarrierError:
                pass

    with app.app_context():
        engine = db.engine
    event.listen(engine, "before_cursor_execute", _hold)
    try:
        yield gate
    finally:
        event.remove(engine, "before_cursor_execute", _hold)


@pytest.mark.skipif(
    os.getenv("LEVAPP_TEST_DB", "sqlite").strip().lower() != "postgres",
    reason="needs two real connections",
)
def test_two_saves_at_once_both_succeed_and_keep_one_row(app):
    user_id = _user(app)
    headers = _headers(app, user_id)
    statuses, errors = [], []

    def save(n):
        try:
            with app.test_client() as c:
                resp = c.post("/api/notifications/save-subscription", json={"subscription": _subscription(n)}, headers=headers)
                statuses.append((resp.status_code, resp.get_data(as_text=True)[:200]))
        except BaseException as exc:  # noqa: BLE001 — surfaced below
            errors.append(exc)

    with _both_requests_reach_the_insert(app) as gate:
        threads = [threading.Thread(target=save, args=(n,)) for n in (1, 2)]
        for t in threads:
            t.start()
        for t in threads:
            t.join(timeout=30)
        assert not any(t.is_alive() for t in threads)
        assert not gate.broken, "the two requests never met at the insert, so this was not a race"

    assert not errors, errors
    assert [s for s, _ in statuses] == [201, 201], statuses
    rows = _rows(app, user_id)
    assert len(rows) == 1
    assert rows[0] in (_subscription(1), _subscription(2))
