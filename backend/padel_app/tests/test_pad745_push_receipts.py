"""PAD-745 — messaging.push-notifications rule 10b: Expo tickets are kept at send and their receipts
read by the scheduler leader. One test per acceptance criterion of "Expo receipts are read", plus
admin.engine-health's "Push receipts are counted"."""
from datetime import datetime, timedelta
from unittest.mock import MagicMock, patch

from apscheduler.triggers.interval import IntervalTrigger

from padel_app.sql_db import db
from padel_app.tests.test_pad695_worker_role import boot  # noqa: F401 — the real-init_scheduler fixture

NOW = datetime(2027, 7, 12, 10, 0)


def _response(payload, status=200):
    resp = MagicMock()
    resp.status_code = status
    resp.json.return_value = payload
    if status >= 400:
        import requests

        resp.raise_for_status.side_effect = requests.HTTPError(response=resp)
    return resp


def _user(username):
    from padel_app.models import User

    u = User(name=username, username=username, email=f"{username}@test.com", password="x", status="active")
    db.session.add(u)
    db.session.commit()
    return u.id


def _receipts(**filters):
    from padel_app.models.push_receipt import PushReceipt

    return PushReceipt.query.filter_by(**filters).order_by(PushReceipt.id).all()


def _kept(ticket_id, token="ExponentPushToken[r]", user_id=None, sent_at=NOW, status="pending"):
    from padel_app.models.push_receipt import PushReceipt

    row = PushReceipt(ticket_id=ticket_id, token=token, user_id=user_id, sent_at=sent_at, status=status)
    db.session.add(row)
    db.session.commit()
    return row.id


def _read(receipts_payload=None, response=None):
    from padel_app.services import push_receipts

    with patch("requests.post") as post:
        post.return_value = response or _response({"data": receipts_payload or {}})
        counts = push_receipts.read(now=NOW)
    return post, counts


# --- kept at send ------------------------------------------------------------------------------

def test_an_ok_ticket_is_kept_pending_and_the_send_makes_one_call(app):
    from padel_app.utils.expo_push import send_expo_push

    with app.app_context():
        uid = _user("p745-a")
        with patch("padel_app.utils.expo_push.requests.post") as post:
            post.return_value = _response({"data": [{"status": "ok", "id": "T1"}]})
            assert send_expo_push(["ExponentPushToken[a]"], "T", "B", {}, user_id=uid) is True
        assert post.call_count == 1
        assert all("getReceipts" not in str(c) for c in post.call_args_list)
        [row] = _receipts()
        assert (row.ticket_id, row.token, row.user_id, row.status) == ("T1", "ExponentPushToken[a]", uid, "pending")


def test_an_outbox_row_names_itself_on_its_receipt(app):
    from padel_app.models import DeviceToken
    from padel_app.utils import push_outbox

    with app.app_context():
        uid = _user("p745-b")
        DeviceToken(user_id=uid, token="ExponentPushToken[b]", platform="ios").create()
        with patch("padel_app.utils.expo_push.requests.post") as post:
            post.return_value = _response({"data": [{"status": "ok", "id": "T42"}]})
            outcome, _ = push_outbox.send_row({"id": 42, "user_id": uid, "channel": "expo",
                                               "payload": {"title": "T", "body": "B", "data": {}}})
        assert outcome == "sent"
        [row] = _receipts()
        assert (row.ticket_id, row.outbox_id, row.user_id) == ("T42", 42, uid)


def test_an_error_ticket_keeps_no_receipt(app):
    from padel_app.utils.expo_push import send_expo_push

    with app.app_context():
        with patch("padel_app.utils.expo_push.requests.post") as post:
            post.return_value = _response({"data": [
                {"status": "error", "details": {"error": "DeviceNotRegistered"}}]})
            send_expo_push(["ExponentPushToken[dead]"], "T", "B", {})
        assert _receipts() == []


def test_a_failed_receipt_write_never_fails_the_send(app):
    from padel_app.utils.expo_push import SENT, send_expo_push_outcome

    with app.app_context():
        with patch("padel_app.utils.expo_push.requests.post") as post, \
                patch("padel_app.sql_db.db.engine.begin", side_effect=RuntimeError("db down")):
            post.return_value = _response({"data": [{"status": "ok", "id": "T9"}]})
            outcome, _ = send_expo_push_outcome(["ExponentPushToken[c]"], "T", "B", {})
        assert outcome == SENT


# --- read by the leader ------------------------------------------------------------------------

def test_an_ok_receipt_marks_the_row_ok_without_an_incident(app):
    from padel_app.models.delivery_incident import DeliveryIncident

    with app.app_context():
        _kept("R-ok", sent_at=NOW - timedelta(minutes=20))
        post, _ = _read({"R-ok": {"status": "ok"}})
        assert post.call_args.kwargs["json"] == {"ids": ["R-ok"]}
        assert post.call_args.args[0].endswith("/push/getReceipts")
        assert _receipts()[0].status == "ok"
        assert DeliveryIncident.query.count() == 0


def test_device_not_registered_retires_the_token_for_everyone(app):
    from padel_app.models import DeviceToken

    with app.app_context():
        a, b = _user("p745-c"), _user("p745-d")
        DeviceToken(user_id=a, token="ExponentPushToken[gone]", platform="ios").create()
        DeviceToken(user_id=b, token="ExponentPushToken[gone]", platform="ios").create()
        _kept("R-dnr", token="ExponentPushToken[gone]", user_id=a, sent_at=NOW - timedelta(hours=1))
        _read({"R-dnr": {"status": "error", "details": {"error": "DeviceNotRegistered"}}})
        [row] = _receipts()
        assert (row.status, row.error_code) == ("error", "DeviceNotRegistered")
        assert DeviceToken.query.filter_by(token="ExponentPushToken[gone]").count() == 0


def test_another_code_records_one_incident_however_often_it_runs(app):
    from padel_app.models.delivery_incident import DeliveryIncident

    with app.app_context():
        uid = _user("p745-e")
        _kept("R-cred", user_id=uid, sent_at=NOW - timedelta(hours=1))
        payload = {"R-cred": {"status": "error", "message": "x", "details": {"error": "InvalidCredentials"}}}
        _read(payload)
        _read(payload)
        [row] = _receipts()
        assert (row.status, row.error_code) == ("error", "InvalidCredentials")
        [incident] = DeliveryIncident.query.all()
        assert (incident.kind, incident.channel, incident.user_id) == ("push_failed", "expo", uid)
        assert incident.detail == "receipt error=InvalidCredentials"


def test_a_ticket_younger_than_15_minutes_is_not_asked_for(app):
    with app.app_context():
        _kept("R-young", sent_at=NOW - timedelta(minutes=5))
        post, _ = _read({})
        assert post.call_count == 0
        assert _receipts()[0].status == "pending"


def test_no_receipt_expires_after_24_hours_and_waits_before(app):
    with app.app_context():
        _kept("R-old", sent_at=NOW - timedelta(hours=25))
        _kept("R-wait", sent_at=NOW - timedelta(hours=2))
        post, counts = _read({})
        assert post.call_args.kwargs["json"] == {"ids": ["R-wait"]}
        assert {r.ticket_id: r.status for r in _receipts()} == {"R-old": "expired", "R-wait": "pending"}
        assert counts["expired"] == 1


def test_1500_pending_tickets_are_asked_in_calls_of_1000_and_500(app):
    from padel_app.models.push_receipt import PushReceipt

    with app.app_context():
        sent = NOW - timedelta(hours=1)
        db.session.execute(PushReceipt.__table__.insert(), [
            {"created_at": sent, "updated_at": sent, "ticket_id": f"R{i:04d}", "token": "t",
             "sent_at": sent, "status": "pending"} for i in range(1500)])
        db.session.commit()
        post, _ = _read({})
        assert [len(c.kwargs["json"]["ids"]) for c in post.call_args_list] == [1000, 500]


def test_a_failed_call_changes_nothing(app):
    with app.app_context():
        _kept("R-503", sent_at=NOW - timedelta(hours=1))
        _, counts = _read(response=_response({}, status=503))
        row = _receipts()[0]
        assert (row.status, row.checked_at) == ("pending", None)
        assert counts["failedCalls"] == 1


def test_the_daily_prune_deletes_receipts_older_than_30_days(app):
    from padel_app.services import push_receipts

    with app.app_context():
        _kept("R-31", sent_at=NOW - timedelta(days=31), status="ok")
        _kept("R-29", sent_at=NOW - timedelta(days=29), status="ok")
        assert push_receipts.prune(now=NOW) == 1
        assert [r.ticket_id for r in _receipts()] == ["R-29"]


def test_the_leader_registers_the_reader_every_10_minutes(boot):
    app, sched, _ = boot(ROLE="api", WORKER_SPLIT="off")
    job = sched.get_job("read_push_receipts")
    assert isinstance(job.trigger, IntervalTrigger) and job.trigger.interval == timedelta(minutes=10)


# --- admin.engine-health -----------------------------------------------------------------------

def test_the_engine_health_summary_counts_push_receipts(app):
    from padel_app.models.push_receipt import PushReceipt
    from padel_app.services.admin import engine_health

    with app.app_context():
        hour = NOW - timedelta(hours=1)
        for i, status in enumerate(("ok", "ok", "error", "pending")):
            _kept(f"H{i}", sent_at=hour, status=status)
        PushReceipt.query.filter_by(ticket_id="H2").update({"error_code": "InvalidCredentials"})
        db.session.commit()
        _kept("H-3d", sent_at=NOW - timedelta(days=3), status="ok")
        body = engine_health._push_receipts(NOW)
        assert body["last24h"] == {"pending": 1, "ok": 2, "error": 1, "expired": 0,
                                   "errorsByCode": {"InvalidCredentials": 1}}
        assert body["last7d"]["ok"] == 3
