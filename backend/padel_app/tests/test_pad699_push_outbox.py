"""PAD-699 — the push outbox (messaging.push-notifications rule 10a; architecture review 2026-10-22).

Enqueue joins the caller's unit of work or writes at once; the drainer claims in one short
transaction, commits each row's outcome on its own, and maps sent | retry | skip onto
sent | pending (backed off) / dead | skipped. At least once: a row is sent again only when the
process died between the provider's accept and that row's commit.
"""
from datetime import timedelta
from types import SimpleNamespace
from unittest.mock import patch

import pytest
from sqlalchemy import text

from padel_app.sql_db import db
from padel_app.utils import push_outbox as po
from padel_app.utils.dates import utcnow_naive


@pytest.fixture
def outbox_app(app):
    app.config["PUSH_QUEUE"] = "outbox"
    return app


def _user(username="p699"):
    from padel_app.models import User

    u = User(name="P699", username=username, password="x", status="active")
    db.session.add(u)
    db.session.commit()
    return u.id


def _rows():
    return [dict(r) for r in db.session.execute(text(
        "SELECT id, channel, user_id, payload, status, attempts, due_at, last_error, claimed_by FROM push_outbox ORDER BY id"
    )).mappings()]


class Sends:
    """A fake sender: answers per call from `plan` (default sent) and records the rows it saw."""

    def __init__(self, *plan):
        self.plan = list(plan)
        self.seen = []

    def __call__(self, row):
        self.seen.append(row["id"])
        return self.plan.pop(0) if self.plan else (po.SENT, None)


# --- enqueue ------------------------------------------------------------------------------------

def test_the_flag_is_off_by_default(app):
    with app.app_context():
        assert po.enabled() is False
        app.config["PUSH_QUEUE"] = "outbox"
        assert po.enabled() is True


def test_outside_a_unit_of_work_the_row_is_written_at_once(outbox_app):
    with outbox_app.app_context():
        uid = _user()
        po.enqueue("expo", uid, {"title": "t", "body": "b"})
        db.session.remove()
        rows = _rows()
        assert len(rows) == 1 and rows[0]["status"] == "pending" and rows[0]["channel"] == "expo"


def test_inside_a_unit_of_work_a_rollback_sends_nothing(outbox_app):
    from padel_app.tools.unit_of_work import unit_of_work

    with outbox_app.app_context():
        uid = _user()
        with pytest.raises(RuntimeError):
            with unit_of_work():
                po.enqueue("expo", uid, {"title": "t", "body": "b"})
                raise RuntimeError("the action failed")
        assert _rows() == []
        with unit_of_work():
            po.enqueue("expo", uid, {"title": "t", "body": "b"})
        assert len(_rows()) == 1


def test_the_senders_enqueue_what_not_where(outbox_app):
    from padel_app.models import DeviceToken
    from padel_app.utils.expo_push import send_expo_push_to_user

    with outbox_app.app_context():
        uid = _user()
        db.session.add(DeviceToken(user_id=uid, token="ExponentPushToken[secret-token]", platform="ios"))
        db.session.commit()
        with patch("padel_app.utils.push_sender.submit") as submit:
            assert send_expo_push_to_user(uid, "Hello", "World", {"type": "message"}, badge=3)
        submit.assert_not_called()
        row = _rows()[0]
        payload = row["payload"] if isinstance(row["payload"], dict) else __import__("json").loads(row["payload"])
        assert payload == {"title": "Hello", "body": "World", "data": {"type": "message"}, "badge": 3}
        assert "secret-token" not in str(row), "no token is stored"


def test_without_the_flag_the_memory_path_is_unchanged(app):
    from padel_app.models import DeviceToken
    from padel_app.utils.expo_push import send_expo_push_to_user

    with app.app_context():
        uid = _user()
        db.session.add(DeviceToken(user_id=uid, token="ExponentPushToken[x]", platform="ios"))
        db.session.commit()
        with patch("padel_app.utils.push_sender.submit", return_value=True) as submit:
            assert send_expo_push_to_user(uid, "a", "b")
        submit.assert_called_once()
        assert _rows() == []


# --- the drainer --------------------------------------------------------------------------------

def _enqueue(n=1, uid=None):
    uid = uid or _user()
    for i in range(n):
        po.enqueue("expo", uid, {"title": f"t{i}", "body": "b"})
    db.session.remove()
    return uid


def test_sent_rows_lose_their_message(outbox_app):
    with outbox_app.app_context():
        _enqueue(2)
    sends = Sends()
    assert po.Drainer(outbox_app, send=sends).drain_once() == 2
    with outbox_app.app_context():
        rows = _rows()
    assert [r["status"] for r in rows] == ["sent", "sent"]
    assert all(r["payload"] is None and r["claimed_by"] is None for r in rows)
    assert len(sends.seen) == 2


def test_skip_is_terminal_without_an_incident(outbox_app):
    from padel_app.models.delivery_incident import DeliveryIncident

    with outbox_app.app_context():
        _enqueue()
    po.Drainer(outbox_app, send=Sends((po.SKIP, "expo disabled"))).drain_once()
    with outbox_app.app_context():
        row = _rows()[0]
        assert row["status"] == "skipped" and row["last_error"] == "expo disabled" and row["payload"] is None
        assert DeliveryIncident.query.count() == 0


def test_a_retry_backs_off_and_the_last_attempt_is_dead_with_an_incident(outbox_app):
    from padel_app.models.delivery_incident import DeliveryIncident

    with outbox_app.app_context():
        _enqueue()
    drainer = po.Drainer(outbox_app, send=Sends(*[(po.RETRY, "HTTPError status=503")] * po.MAX_ATTEMPTS))
    before = utcnow_naive()
    drainer.drain_once()
    with outbox_app.app_context():
        row = _rows()[0]
        due = row["due_at"] if not isinstance(row["due_at"], str) else __import__("datetime").datetime.fromisoformat(row["due_at"])
        assert row["status"] == "pending" and row["attempts"] == 1
        assert due >= before + timedelta(seconds=po.BACKOFF_SECONDS * 2) - timedelta(seconds=1)
        assert drainer.drain_once() == 0, "not due yet"
        for _ in range(po.MAX_ATTEMPTS - 1):
            db.session.execute(text("UPDATE push_outbox SET due_at = :now"), {"now": utcnow_naive() - timedelta(seconds=1)})
            db.session.commit()
            drainer.drain_once()
        row = _rows()[0]
        assert row["status"] == "dead" and row["attempts"] == po.MAX_ATTEMPTS and row["payload"] is None
        incident = DeliveryIncident.query.one()
        assert incident.kind == "push_failed" and "outbox dead after 6 attempts" in incident.detail


def test_a_stopping_drainer_puts_its_claims_back(outbox_app):
    with outbox_app.app_context():
        _enqueue(3)
    drainer = po.Drainer(outbox_app, send=Sends())
    drainer._stop.set()
    assert drainer.drain_once() == 3
    with outbox_app.app_context():
        assert [r["status"] for r in _rows()] == ["pending"] * 3, "claimed, not sent, released"
        assert all(r["claimed_by"] is None for r in _rows())


def test_killed_before_the_send_it_is_delivered_once_after_the_restart(outbox_app):
    """Ticket done-when: insert, kill the worker before the send, restart → delivered once."""
    with outbox_app.app_context():
        _enqueue()
        dead = po.Drainer(outbox_app)
        po._claim(db.engine, dead.me)  # claimed, then the process died: no send, no outcome
        assert po.Drainer(outbox_app, send=Sends()).drain_once() == 0, "the lease still holds"
        db.session.execute(text("UPDATE push_outbox SET claimed_at = :old"),
                           {"old": utcnow_naive() - timedelta(seconds=po.LEASE_SECONDS + 1)})
        db.session.commit()
    sends = Sends()
    restarted = po.Drainer(outbox_app, send=sends)
    assert restarted.drain_once() == 1 and len(sends.seen) == 1
    assert restarted.drain_once() == 0
    with outbox_app.app_context():
        assert _rows()[0]["status"] == "sent"


def test_killed_after_the_accept_before_the_commit_it_is_redelivered_at_most_once(outbox_app):
    with outbox_app.app_context():
        _enqueue()
    accepted = []

    def accept_then_die(row):
        accepted.append(row["id"])
        raise SystemExit  # the provider accepted; the process dies before the outcome commits

    with pytest.raises(SystemExit):
        po.Drainer(outbox_app, send=accept_then_die).drain_once()
    with outbox_app.app_context():
        db.session.execute(text("UPDATE push_outbox SET claimed_at = :old"),
                           {"old": utcnow_naive() - timedelta(seconds=po.LEASE_SECONDS + 1)})
        db.session.commit()
    sends = Sends()
    restarted = po.Drainer(outbox_app, send=sends)
    restarted.drain_once()
    restarted.drain_once()
    assert len(accepted) + len(sends.seen) == 2, "one accept lost to the crash, one re-delivery, no more"


def test_a_lease_held_by_another_drainer_is_left_alone(outbox_app):
    with outbox_app.app_context():
        _enqueue()
        po._claim(db.engine, "other-drainer")
    assert po.Drainer(outbox_app, send=Sends()).drain_once() == 0


def test_start_and_stop_are_idempotent(outbox_app):
    drainer = po.Drainer(outbox_app, poll=0.05, send=Sends())
    drainer.start()
    first = drainer._thread
    drainer.start()
    assert drainer._thread is first
    drainer.stop()
    drainer.stop()
    assert not drainer.running
    drainer.start()
    assert drainer.running and drainer._thread is not first, "leadership acquired again"
    drainer.stop()


@pytest.mark.skipif("LEVAPP_TEST_DB" not in __import__("os").environ
                    or __import__("os").environ["LEVAPP_TEST_DB"] != "postgres",
                    reason="FOR UPDATE SKIP LOCKED needs Postgres")
def test_two_drainers_claim_disjoint_rows(outbox_app):
    import threading

    with outbox_app.app_context():
        _enqueue(40)
    seen = []
    lock = threading.Lock()

    def record(row):
        with lock:
            seen.append(row["id"])
        return po.SENT, None

    drainers = [po.Drainer(outbox_app, send=record) for _ in range(2)]
    threads = [threading.Thread(target=lambda d=d: [d.drain_once(limit=5) for _ in range(10)]) for d in drainers]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    assert len(seen) == 40 and len(set(seen)) == 40, "each row sent exactly once"


def test_prune_keeps_what_is_recent(outbox_app):
    with outbox_app.app_context():
        uid = _user()
        old, fresh = utcnow_naive() - timedelta(hours=25), utcnow_naive()
        for status, updated in (("sent", old), ("skipped", old), ("sent", fresh), ("dead", old),
                                ("dead", utcnow_naive() - timedelta(days=31)), ("pending", old)):
            db.session.execute(text(
                "INSERT INTO push_outbox (created_at, updated_at, due_at, channel, user_id, status, attempts) "
                "VALUES (:u, :u, :u, 'expo', :uid, :s, 0)"), {"u": updated, "uid": uid, "s": status})
        db.session.commit()
        assert po.prune(db.engine) == 3
        assert sorted(r["status"] for r in _rows()) == ["dead", "pending", "sent"]


# --- destinations and outcomes ------------------------------------------------------------------

def test_send_row_looks_the_destination_up_now(outbox_app, monkeypatch):
    with outbox_app.app_context():
        uid = _user()
        row = {"id": 1, "channel": "expo", "user_id": uid, "payload": {"title": "t", "body": "b"}, "attempts": 0}
        monkeypatch.delenv("EXPO_PUSH_DISABLED", raising=False)
        assert po.send_row(row) == (po.SKIP, "no device"), "a token deleted after the enqueue"
        monkeypatch.setenv("EXPO_PUSH_DISABLED", "1")
        assert po.send_row(row) == (po.SKIP, "expo disabled")
        web = {**row, "channel": "webpush"}
        monkeypatch.delenv("VAPID_PRIVATE_KEY", raising=False)
        assert po.send_row(web) == (po.SKIP, "vapid unconfigured")


def _expo_response(*receipts):
    return SimpleNamespace(raise_for_status=lambda: None, json=lambda: {"data": list(receipts)})


@pytest.mark.parametrize("receipts,expected", [
    ([{"status": "ok"}], "sent"),
    ([{"status": "ok"}, {"status": "error", "details": {"error": "MessageRateExceeded"}}], "sent"),
    ([{"status": "error", "details": {"error": "DeviceNotRegistered"}}], "skip"),
    ([{"status": "error", "details": {"error": "MessageRateExceeded"}}], "retry"),
])
def test_expo_outcomes(app, monkeypatch, receipts, expected):
    from padel_app.utils import expo_push

    monkeypatch.delenv("EXPO_PUSH_DISABLED", raising=False)
    tokens = [f"ExponentPushToken[{i}]" for i in range(len(receipts))]
    with app.app_context(), patch.object(expo_push.requests, "post", return_value=_expo_response(*receipts)):
        assert expo_push.send_expo_push_outcome(tokens, "t", "b")[0] == expected


def test_an_expo_transport_failure_is_a_retry(app, monkeypatch):
    import requests

    from padel_app.utils import expo_push

    monkeypatch.delenv("EXPO_PUSH_DISABLED", raising=False)
    with app.app_context(), patch.object(expo_push.requests, "post", side_effect=requests.ConnectionError("down")):
        outcome, detail = expo_push.send_expo_push_outcome(["ExponentPushToken[1]"], "t", "b")
    assert outcome == "retry" and detail == "ConnectionError"


@pytest.mark.parametrize("status,expected", [(410, "skip"), (404, "skip"), (500, "retry"), (429, "retry")])
def test_web_push_outcomes(app, status, expected):
    from pywebpush import WebPushException

    from padel_app.utils import push_notifications as pn

    exc = WebPushException("x", response=SimpleNamespace(status_code=status))
    with app.app_context(), patch.object(pn, "webpush", side_effect=exc):
        assert pn._deliver_web_push_outcome(1, 99, '{"endpoint": "https://e"}', "{}", "k", {"sub": "m"})[0] == expected
    with app.app_context(), patch.object(pn, "webpush", return_value=None):
        assert pn._deliver_web_push_outcome(1, 99, '{"endpoint": "https://e"}', "{}", "k", {"sub": "m"}) == ("sent", None)


# --- leadership wiring --------------------------------------------------------------------------

def test_the_drainer_follows_the_flag_and_is_one_per_process(app):
    from padel_app import scheduler as sched_mod

    assert sched_mod._push_drainer(app) is None, "PUSH_QUEUE=memory: no drainer"
    app.config["PUSH_QUEUE"] = "outbox"
    first = sched_mod._push_drainer(app)
    assert first is not None and sched_mod._push_drainer(app) is first
    sched_mod.stop_push_drainer(app)  # never started: harmless


def test_a_drainer_whose_lease_was_taken_over_cannot_overwrite_the_row(outbox_app):
    """A slow drainer finishing after its lease ran out and another drainer reclaimed the row must
    not mark it sent under the new holder."""
    with outbox_app.app_context():
        _enqueue()
        slow = po._claim(db.engine, "slow-drainer")[0]
        db.session.execute(text("UPDATE push_outbox SET claimed_at = :old"),
                           {"old": utcnow_naive() - timedelta(seconds=po.LEASE_SECONDS + 1)})
        db.session.commit()
        assert len(po._claim(db.engine, "new-holder")) == 1
        assert po._finish(db.engine, "slow-drainer", slow, po.SENT, None) == "lost"
        db.session.remove()
        row = _rows()[0]
        assert row["status"] == "sending" and row["claimed_by"] == "new-holder"


def test_the_drainer_makes_pad680s_sound_decision_when_it_sends(outbox_app, monkeypatch):
    """#760 (PAD-680, PAD-743): with the user's switch on, every iOS device gets `sound`, an older
    build's too; an Android device without the capability stays silent. The outbox row carries no
    sound; the drainer decides."""
    from padel_app.models import DeviceToken
    from padel_app.utils import expo_push

    monkeypatch.delenv("EXPO_PUSH_DISABLED", raising=False)
    with outbox_app.app_context():
        uid = _user()
        db.session.add(DeviceToken(user_id=uid, token="ExponentPushToken[capable]", platform="ios", sound_capable=True))
        db.session.add(DeviceToken(user_id=uid, token="ExponentPushToken[old-build]", platform="ios", sound_capable=False))
        db.session.add(DeviceToken(user_id=uid, token="ExponentPushToken[android]", platform="android", sound_capable=False))
        db.session.commit()
        assert expo_push.send_expo_push_to_user(uid, "Hello", "World")
        row = _rows()[0]
        assert "sound" not in str(row["payload"])
    sent = []

    def post(url, json, headers, timeout):
        sent.extend(json)
        return SimpleNamespace(raise_for_status=lambda: None, json=lambda: {"data": [{"status": "ok"} for _ in json]})

    with patch.object(expo_push.requests, "post", side_effect=post):
        po.Drainer(outbox_app).drain_once()
    by_token = {m["to"]: m for m in sent}
    assert by_token["ExponentPushToken[capable]"]["sound"] == "default"
    assert by_token["ExponentPushToken[old-build]"]["sound"] == "default"
    assert "sound" not in by_token["ExponentPushToken[android]"]
    with outbox_app.app_context():
        assert _rows()[0]["status"] == "sent"


def test_a_user_who_switched_sound_off_gets_silent_pushes(outbox_app, monkeypatch):
    from padel_app.models import DeviceToken, User
    from padel_app.utils import expo_push

    monkeypatch.delenv("EXPO_PUSH_DISABLED", raising=False)
    with outbox_app.app_context():
        uid = _user("p699quiet")
        db.session.get(User, uid).notif_sound = False
        db.session.add(DeviceToken(user_id=uid, token="ExponentPushToken[capable2]", platform="ios", sound_capable=True))
        db.session.add(DeviceToken(user_id=uid, token="ExponentPushToken[old2]", platform="ios", sound_capable=False))
        db.session.commit()
        expo_push.send_expo_push_to_user(uid, "Hello", "World")
    sent = []

    def post(url, json, headers, timeout):
        sent.extend(json)
        return SimpleNamespace(raise_for_status=lambda: None, json=lambda: {"data": [{"status": "ok"} for _ in json]})

    with patch.object(expo_push.requests, "post", side_effect=post):
        po.Drainer(outbox_app).drain_once()
    assert len(sent) == 2 and all("sound" not in m for m in sent)
