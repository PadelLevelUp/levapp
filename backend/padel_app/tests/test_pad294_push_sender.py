"""
PAD-294 — push goes out off the calling thread through a bounded in-process
sender (messaging.push-notifications rule 10 and its criterion).

The DB lookups stay on the caller; the HTTP call runs on the sender's worker;
a full queue drops with a warning instead of blocking; the stale-token cleanup
runs in the worker; under the test config the sender is inline.
"""
import json
import queue
import threading
import time
from unittest.mock import patch

import pytest

from padel_app.sql_db import db


class _Response:
    def __init__(self, payload):
        self._payload = payload
        self.status_code = 200

    def raise_for_status(self):
        pass

    def json(self):
        return self._payload


def _user_with_token(name, username, token="ExponentPushToken[t1]"):
    from padel_app.models import DeviceToken, User

    user = User(name=name, username=username, email=f"{username}@t.test", password="x", status="active")
    db.session.add(user)
    db.session.flush()
    db.session.add(DeviceToken(user_id=user.id, token=token, platform="ios"))
    db.session.commit()
    return user.id


@pytest.fixture
def async_sender(app):
    """The real (asynchronous) sender, with a fresh queue and a clean flush after."""
    from padel_app.utils import push_sender

    app.config["PUSH_SENDER_INLINE"] = False
    yield push_sender
    push_sender.flush(timeout=5)
    app.config["PUSH_SENDER_INLINE"] = None


def test_under_the_test_config_the_sender_runs_inline(app):
    from padel_app.utils import push_sender

    seen = []
    with app.app_context():
        assert push_sender.submit(seen.append, threading.current_thread().name) is True
    assert seen == [threading.current_thread().name]


def test_a_submitted_job_runs_on_the_worker_thread_and_flush_waits(app, async_sender):
    seen = []
    with app.app_context():
        assert async_sender.submit(lambda: seen.append(threading.current_thread().name)) is True
        assert async_sender.flush(timeout=5) is True
    assert seen == ["push-sender"]


# The queue-full policy (drop the OLDEST, pause after consecutive provider
# timeouts) is pinned in test_pad294_push_sender_review.py.

def test_expo_push_is_looked_up_on_the_caller_and_sent_on_the_worker(app, async_sender):
    from padel_app.utils.expo_push import send_expo_push_to_user

    calls = []

    def fake_post(url, json=None, headers=None, timeout=None):
        calls.append((threading.current_thread().name, json))
        return _Response({"data": [{"status": "ok"} for _ in json]})

    with app.app_context():
        user_id = _user_with_token("Ana", "p294ana")
        with patch("padel_app.utils.expo_push.requests.post", side_effect=fake_post):
            assert send_expo_push_to_user(user_id, "T", "B", {"type": "message"}, badge=2) is True
            assert async_sender.flush(timeout=5) is True
    assert len(calls) == 1
    thread, payload = calls[0]
    assert thread == "push-sender"
    assert payload[0]["to"] == "ExponentPushToken[t1]" and payload[0]["badge"] == 2


def test_the_worker_deletes_a_device_token_expo_reports_unregistered(app, async_sender):
    from padel_app.models import DeviceToken
    from padel_app.utils.expo_push import send_expo_push_to_user

    def fake_post(url, json=None, headers=None, timeout=None):
        return _Response({"data": [{"status": "error", "details": {"error": "DeviceNotRegistered"}}]})

    with app.app_context():
        user_id = _user_with_token("Bea", "p294bea", token="ExponentPushToken[stale]")
        with patch("padel_app.utils.expo_push.requests.post", side_effect=fake_post):
            send_expo_push_to_user(user_id, "T", "B", {})
            assert async_sender.flush(timeout=5) is True
        db.session.remove()
        assert DeviceToken.query.filter_by(token="ExponentPushToken[stale]").count() == 0


def test_web_push_is_looked_up_on_the_caller_and_sent_on_the_worker(app, async_sender, monkeypatch):
    from padel_app.models import PushSubscription, User
    from padel_app.utils.push_notifications import send_push_notification

    monkeypatch.setenv("VAPID_PUBLIC_KEY", "pub")
    monkeypatch.setenv("VAPID_PRIVATE_KEY", "priv")
    monkeypatch.setenv("VAPID_CLAIMS_EMAIL", "mailto:ops@levapp.app")
    calls = []

    def fake_webpush(**kwargs):
        calls.append((threading.current_thread().name, kwargs))

    with app.app_context():
        user = User(name="Carla", username="p294carla", email="carla294@t.test", password="x", status="active")
        db.session.add(user)
        db.session.flush()
        db.session.add(PushSubscription(user_id=user.id, subscription_json=json.dumps({"endpoint": "https://x"})))
        db.session.commit()
        with patch("padel_app.utils.push_notifications.webpush", side_effect=fake_webpush):
            assert send_push_notification(user.id, "T", "B", url="/messages/1") is True
            assert async_sender.flush(timeout=5) is True
    assert len(calls) == 1 and calls[0][0] == "push-sender"
    assert json.loads(calls[0][1]["data"])["url"] == "/messages/1"


def test_a_system_message_returns_before_the_push_round_trip(app, async_sender):
    """The criterion: a slow push service does not hold the engine.

    Proven by ORDER, not by a stopwatch (B-129). The fake push blocks on an Event
    the test holds until the engine has returned; only then is it released. If the
    engine ever waited for the push, this test would hang at the call — and the
    test's own deadline turns that into a failure. Until 2026-09-22 this asserted
    `elapsed < 0.25 s` against a 0.3 s sleep, a wall-clock budget that a slow CI
    runner could miss for reasons unrelated to the code (0.383 s on one Postgres job
    while the identical merge passed twice) — the B-100 family.
    """
    from padel_app.models import Coach, User
    from padel_app.services import notification_service as ns

    engine_returned = threading.Event()   # set by the test after the engine returns
    push_started = threading.Event()      # set by the worker when the fake push begins
    push_finished_after_return = []       # what the worker saw when it was released

    def blocking_post(url, json=None, headers=None, timeout=None):
        push_started.set()
        # The worker parks here. If this ran on the caller's thread, the engine
        # could never return before this wait — and the test's own timeout below
        # would end it.
        released_in_time = engine_returned.wait(timeout=10)
        push_finished_after_return.append(released_in_time)
        return _Response({"data": [{"status": "ok"} for _ in json]})

    with app.app_context():
        coach_user = User(name="Coach", username="p294coach", email="c294@t.test", password="x", status="active")
        db.session.add(coach_user)
        db.session.flush()
        db.session.add(Coach(user_id=coach_user.id, approval_status="approved"))
        db.session.commit()
        student_user_id = _user_with_token("Dora", "p294dora", token="ExponentPushToken[d]")
        with patch("padel_app.utils.expo_push.requests.post", side_effect=blocking_post), \
             patch.object(ns, "publish"):
            msg = ns._send_system_message(coach_user.id, student_user_id, "Hello", message_type="text")
            # The engine has returned while the push is still parked — that is the
            # whole claim. A push that had already run on the caller's thread could
            # not be parked now.
            assert msg is not None
            assert async_sender.pending() >= 1, "the push was not handed to the worker"
            assert push_started.wait(timeout=5), "the worker never started the push"
            assert push_finished_after_return == [], "the push completed before the engine returned"
            engine_returned.set()
            assert async_sender.flush(timeout=5) is True
            assert push_finished_after_return == [True]
