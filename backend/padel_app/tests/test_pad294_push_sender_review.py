"""
PAD-294 review fixes (Session G on PR #212; messaging.push-notifications rule 10):

1. the web-push 404/410 cleanup deletes a subscription only when the row still
   holds the subscription the failed push was sent to — a re-subscribe that
   refreshed the same row between submit and delivery survives;
2. queue-full policy is drop-OLDEST, and after N consecutive slow deliveries
   (a provider timeout) the sender short-circuits for a cool-down instead of
   queueing 500 pushes that will all time out;
3. the inline (test-config) path and the worker path share one ``_execute``,
   so an exception inside a sender is logged and swallowed the same way in
   both.
"""
import json
import queue
import threading
import time
from unittest.mock import patch

import pytest

from padel_app.sql_db import db


@pytest.fixture
def async_sender(app):
    from padel_app.utils import push_sender

    app.config["PUSH_SENDER_INLINE"] = False
    push_sender.reset_circuit()
    yield push_sender
    push_sender.flush(timeout=5)
    push_sender.reset_circuit()
    app.config["PUSH_SENDER_INLINE"] = None


def _subscribed_user(username, endpoint):
    from padel_app.models import PushSubscription, User

    user = User(name=username, username=username, email=f"{username}@t.test", password="x", status="active")
    db.session.add(user)
    db.session.flush()
    sub = PushSubscription(user_id=user.id, subscription_json=json.dumps({"endpoint": endpoint}))
    db.session.add(sub)
    db.session.commit()
    return user.id, sub.id


class _Gone(Exception):
    pass


def _webpush_gone(**kwargs):
    from pywebpush import WebPushException

    class R:
        status_code = 410

    exc = WebPushException("gone")
    exc.response = R()
    raise exc


def test_a_re_subscribe_between_submit_and_delivery_is_not_deleted(app, async_sender, monkeypatch):
    """Finding 1: the row was refreshed in place; the stale endpoint is gone already."""
    from padel_app.models import PushSubscription
    from padel_app.utils.push_notifications import send_push_notification

    monkeypatch.setenv("VAPID_PUBLIC_KEY", "pub")
    monkeypatch.setenv("VAPID_PRIVATE_KEY", "priv")
    monkeypatch.setenv("VAPID_CLAIMS_EMAIL", "mailto:ops@levapp.app")
    gate = threading.Event()

    def slow_gone(**kwargs):
        gate.wait(5)
        _webpush_gone(**kwargs)

    with app.app_context():
        user_id, sub_id = _subscribed_user("p294resub", "https://old")
        with patch("padel_app.utils.push_notifications.webpush", side_effect=slow_gone):
            assert send_push_notification(user_id, "T", "B") is True
            # the browser re-subscribes while the push is still on the wire
            row = db.session.get(PushSubscription, sub_id)
            row.subscription_json = json.dumps({"endpoint": "https://new"})
            db.session.commit()
            gate.set()
            assert async_sender.flush(timeout=5) is True
        db.session.remove()
        row = db.session.get(PushSubscription, sub_id)
        assert row is not None and json.loads(row.subscription_json)["endpoint"] == "https://new"

    # …whereas an unchanged stale row is still cleaned up.
    with app.app_context():
        user_id, sub_id = _subscribed_user("p294stale", "https://stale")
        with patch("padel_app.utils.push_notifications.webpush", side_effect=_webpush_gone):
            send_push_notification(user_id, "T", "B")
            assert async_sender.flush(timeout=5) is True
        db.session.remove()
        assert db.session.get(PushSubscription, sub_id) is None


def test_a_full_queue_drops_the_oldest_push_not_the_newest(app, async_sender, caplog):
    """Finding 2a: the newest push (a reminder) is kept; the oldest is dropped and logged."""
    release = threading.Event()
    ran = []
    # A worker is bound to the queue it started on: park the real queue's worker
    # reference, let a fresh one serve the patched queue, and hand the reference
    # back afterwards so the real queue never gets a second consumer.
    real_worker = async_sender._worker
    with app.app_context(), patch.object(async_sender, "_queue", queue.Queue(maxsize=2)):
        async_sender._worker = None
        assert async_sender.submit(release.wait, 5, label="blocker") is True  # occupies the worker
        time.sleep(0.05)
        assert async_sender.submit(ran.append, "oldest", label="push for user 1") is True
        assert async_sender.submit(ran.append, "middle", label="push for user 2") is True
        with caplog.at_level("WARNING"):
            assert async_sender.submit(ran.append, "newest", label="push for user 3") is True
        assert any("dropping oldest" in r.message and "push for user 1" in r.message for r in caplog.records)
        release.set()
        assert async_sender.flush(timeout=5) is True
    async_sender._worker = real_worker
    assert ran == ["middle", "newest"]


def test_consecutive_slow_deliveries_open_the_circuit_and_it_closes_after_the_cooldown(app, async_sender, caplog, monkeypatch):
    """Finding 2b: after N slow deliveries the sender stops queueing for a while."""
    monkeypatch.setattr(async_sender, "SLOW_SECONDS", 0.05)
    monkeypatch.setattr(async_sender, "CIRCUIT_TRIP", 2)
    monkeypatch.setattr(async_sender, "CIRCUIT_SECONDS", 0.3)
    delivered = []

    def slow(tag):
        time.sleep(0.08)
        delivered.append(tag)

    with app.app_context():
        assert async_sender.submit(slow, "a", label="push a") is True
        assert async_sender.submit(slow, "b", label="push b") is True
        assert async_sender.flush(timeout=5) is True
        assert async_sender.circuit_open() is True
        with caplog.at_level("WARNING"):
            assert async_sender.submit(delivered.append, "c", label="push c") is False
        assert any("provider unresponsive" in r.message and "push c" in r.message for r in caplog.records)
        time.sleep(0.35)
        assert async_sender.circuit_open() is False
        assert async_sender.submit(delivered.append, "d", label="push d") is True
        assert async_sender.flush(timeout=5) is True
    assert delivered == ["a", "b", "d"]


def test_inline_and_worker_paths_swallow_a_sender_exception_the_same_way(app, caplog):
    """Finding 3: one _execute for both paths."""
    from padel_app.utils import push_sender

    def boom():
        raise RuntimeError("provider exploded")

    with app.app_context():
        app.config["PUSH_SENDER_INLINE"] = True
        with caplog.at_level("WARNING"):
            assert push_sender.submit(boom, label="inline push") is True  # accepted, not raised
        assert any("inline push" in r.message and "provider exploded" in r.message for r in caplog.records)
        caplog.clear()
        app.config["PUSH_SENDER_INLINE"] = False
        with caplog.at_level("WARNING"):
            assert push_sender.submit(boom, label="worker push") is True
            assert push_sender.flush(timeout=5) is True
        assert any("worker push" in r.message and "provider exploded" in r.message for r in caplog.records)
        app.config["PUSH_SENDER_INLINE"] = None
