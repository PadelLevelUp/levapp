"""PAD-534 — admin.engine-health: the read-only engine health page's API, and the failure paths
that now record a `delivery_incidents` row (rule 3). One test per acceptance criterion of the spec,
plus the peer-token gate of `/admin/api/deploy-identity` (rule 5)."""
from datetime import datetime, timedelta
from types import SimpleNamespace
from unittest.mock import patch

import pytest

from padel_app.sql_db import db
from padel_app.tests.admin_helpers import admin_token, bearer, make_role
from padel_app.tests.helpers import pin_clock

NOW = datetime(2027, 7, 12, 10, 0)


def _support(app):
    return bearer(admin_token(app, make_role(app, "sam@levapp.app", "support")))


def _incidents(**filters):
    from padel_app.models.delivery_incident import DeliveryIncident
    return DeliveryIncident.query.filter_by(**filters).all()


def _club():
    from padel_app.models.clubs import Club
    club = Club(name=f"P534 {Club.query.count()}", description="", location="Lisboa")
    db.session.add(club)
    db.session.flush()
    return club.id


def _seed_engine():
    """A coach and a class; vacancies and invitations in the shapes the criteria name."""
    from padel_app.models import Coach, LessonInstance, Lesson, User
    from padel_app.models.notification_event import NotificationEvent
    from padel_app.models.vacancy import Vacancy

    u = User(name="Maria Coach", username="p534maria", email="p534maria@t.test", password="x", status="active")
    db.session.add(u)
    db.session.flush()
    coach = Coach(user_id=u.id)
    db.session.add(coach)
    db.session.flush()
    start = NOW + timedelta(days=1)
    lesson = Lesson(title="P534", start_datetime=start, end_datetime=start + timedelta(hours=1),
                    is_recurring=False, type="academy", max_players=8, color="#000", status="active",
                    club_id=_club())
    db.session.add(lesson)
    db.session.flush()
    inst = LessonInstance(lesson_id=lesson.id, start_datetime=start, end_datetime=start + timedelta(hours=1),
                          max_players=8, status="scheduled", notifications_enabled=True)
    db.session.add(inst)
    db.session.flush()
    for rnd, batch, status in ((1, 1, "open"), (1, 1, "open"), (2, 1, "open"), (1, 1, "filled")):
        db.session.add(Vacancy(lesson_instance_id=inst.id, coach_id=coach.id, status=status,
                               current_round_number=rnd, current_batch_number=batch))
    db.session.flush()
    from padel_app.models.players import Player
    su = User(name="Student", username="p534student", email="p534s@t.test", password="x", status="active")
    db.session.add(su)
    db.session.flush()
    player = Player(user_id=su.id)
    db.session.add(player)
    db.session.flush()
    for status in ("sent", "sent", "sent", "expired"):
        db.session.add(NotificationEvent(coach_id=coach.id, lesson_instance_id=inst.id, player_id=player.id,
                                         type="auto", round_number=1, status=status))
    db.session.commit()
    return coach.id


def test_the_summary_counts_what_the_engine_holds(app, client):
    headers = _support(app)
    with app.app_context():
        _seed_engine()
    body = client.get("/admin/api/engine-health", headers=headers).get_json()
    assert body["vacancies"]["byRoundAndBatch"] == [{"round": 1, "batch": 1, "count": 2},
                                                    {"round": 2, "batch": 1, "count": 1}]
    assert body["vacancies"]["open"] == 3
    assert body["invitations"]["live"] == 3


def test_overdue_jobs_and_missing_singletons_are_visible(app, client, live_scheduler, monkeypatch):
    from apscheduler.triggers.date import DateTrigger

    headers = _support(app)
    sched = live_scheduler._scheduler
    sched.add_job(func=print, trigger=DateTrigger(run_date=datetime(2031, 1, 1), timezone="UTC"),
                  id="process_batches")
    sched.add_job(func=print, trigger=DateTrigger(run_date=datetime(2030, 1, 1), timezone="UTC"),
                  id="reminder_lesson_7_2030-01-02")
    # Ten minutes overdue against a pinned now: the paused scheduler never ran it.
    pin_clock(monkeypatch, datetime(2030, 1, 1, 0, 10))
    body = client.get("/admin/api/engine-health", headers=headers).get_json()["scheduler"]
    assert body["overdue"] == 1
    assert body["singletons"]["process_batches"] is True
    assert body["singletons"]["extend_schedule_window"] is False
    assert body["byFamily"]["reminder_lesson_*"] == 1


def test_a_failed_email_is_recorded_without_the_address(app):
    from padel_app.tools import email_tools

    with app.app_context():
        u = __import__("padel_app.models", fromlist=["User"]).User(
            name="Coach", username="p534c", email="coach534@t.test", password="x", status="active")
        db.session.add(u)
        db.session.commit()
        with patch.object(email_tools, "debug_endpoints_enabled", return_value=False), \
                patch.object(email_tools, "_sender", return_value="noreply@levapp.app"), \
                patch.object(email_tools, "allowed_recipients", side_effect=lambda r: list(r)), \
                patch.object(email_tools.mail, "send", side_effect=ConnectionRefusedError("smtp down")), \
                pytest.raises(ConnectionRefusedError):
            email_tools.send_email("Hello", ["coach534@t.test"], body="x")
        (row,) = _incidents(kind="email_failed")
        assert row.user_id == u.id and row.channel == "email"
        assert all("coach534" not in str(v) for v in (row.detail, row.error_class, row.subject_type))


def test_a_failed_web_push_is_recorded_without_subscription_data(app):
    from pywebpush import WebPushException

    from padel_app.utils import push_notifications as pn

    from padel_app.models import User

    with app.app_context():
        u = User(name="Pushed", username="p534push", email="p534push@t.test", password="x", status="active")
        db.session.add(u)
        db.session.commit()
        exc = WebPushException("gone", response=SimpleNamespace(status_code=410))
        with patch.object(pn, "webpush", side_effect=exc):
            assert pn._deliver_web_push(u.id, 999, '{"endpoint": "https://push.example/abc"}',
                                        "{}", "key", {}) is False
        (row,) = _incidents(kind="push_failed")
        assert (row.channel, row.user_id) == ("webpush", u.id)
        assert "push.example" not in (row.detail or "")


def test_a_missed_reminder_job_is_recorded(app, live_scheduler):
    with app.app_context():
        live_scheduler._on_job_missed(SimpleNamespace(job_id="reminder_lesson_5_2027-07-12"))
        live_scheduler._on_job_missed(SimpleNamespace(job_id="process_batches"))  # not a reminder
        (row,) = _incidents(kind="reminder_skipped_past_due")
        assert (row.subject_type, row.subject_id, row.channel) == ("lesson", 5, "scheduler")


def test_a_pass_that_finds_its_class_started_is_recorded(app, live_scheduler):
    from padel_app.models import Lesson, LessonInstance

    with app.app_context():
        start = datetime.utcnow() - timedelta(hours=1)
        lesson = Lesson(title="Past", start_datetime=start, end_datetime=start + timedelta(hours=1),
                        is_recurring=False, type="academy", max_players=4, color="#000", status="active",
                        club_id=_club())
        db.session.add(lesson)
        db.session.flush()
        inst = LessonInstance(lesson_id=lesson.id, start_datetime=start, end_datetime=start + timedelta(hours=1),
                              max_players=4, status="scheduled", notifications_enabled=True)
        db.session.add(inst)
        db.session.commit()
        live_scheduler._run_send_reminders(inst.id)
        (row,) = _incidents(kind="reminder_skipped_past_due")
        assert (row.subject_type, row.subject_id) == ("lesson_instance", inst.id)


def test_a_failing_incident_insert_never_breaks_a_send(app):
    from padel_app.models.delivery_incident import DeliveryIncident
    from padel_app.tools import email_tools

    with app.app_context():
        broken = SimpleNamespace(insert=lambda: (_ for _ in ()).throw(RuntimeError("table gone")))
        with patch.object(DeliveryIncident, "__table__", broken), \
                patch.object(email_tools, "debug_endpoints_enabled", return_value=False), \
                patch.object(email_tools, "_sender", return_value="noreply@levapp.app"), \
                patch.object(email_tools, "allowed_recipients", side_effect=lambda r: list(r)), \
                patch.object(email_tools.mail, "send", side_effect=TimeoutError("slow")), \
                pytest.raises(TimeoutError):
            email_tools.send_email("Hello", ["x@t.test"], body="x")


def test_old_incidents_are_pruned(app, monkeypatch):
    from padel_app.models.delivery_incident import DeliveryIncident
    from padel_app.services import delivery_incidents

    with app.app_context():
        for days in (31, 29):
            db.session.add(DeliveryIncident(kind="email_failed", channel="email",
                                            created_at=NOW - timedelta(days=days)))
        db.session.commit()
        assert delivery_incidents.prune(now=NOW) == 1
        assert [round((NOW - r.created_at).days) for r in DeliveryIncident.query.all()] == [29]


def test_deploy_identity_for_both_environments(app, client, monkeypatch):
    import time as _time

    headers = _support(app)
    monkeypatch.setenv("GIT_SHA", "abc1234")
    with app.app_context():
        with db.engine.begin() as conn:
            # A migrated database (Postgres) already holds its head; one built from the models
            # (SQLite) has no table, so give it one. Either way the API must report what is there.
            conn.exec_driver_sql("CREATE TABLE IF NOT EXISTS alembic_version (version_num VARCHAR(32))")
            if conn.exec_driver_sql("SELECT count(*) FROM alembic_version").scalar() == 0:
                conn.exec_driver_sql("INSERT INTO alembic_version VALUES ('e33b118e4205')")
            db_head = conn.exec_driver_sql("SELECT version_num FROM alembic_version").scalar()
    app.config.update(ADMIN_PEER_URL="https://admin.staging.example", ADMIN_PEER_TOKEN="peer-secret")

    class _Ok:
        def raise_for_status(self):
            return None

        def json(self):
            return {"gitSha": "def5678", "alembicHead": "x1"}

    with patch("requests.get", return_value=_Ok()) as get:
        body = client.get("/admin/api/engine-health", headers=headers).get_json()["deploy"]
    assert body["this"] == {"gitSha": "abc1234", "alembicHead": db_head}
    assert body["other"] == {"gitSha": "def5678", "alembicHead": "x1"}
    assert get.call_args.kwargs["timeout"] == 2
    assert get.call_args.kwargs["headers"] == {"Authorization": "Peer peer-secret"}

    import requests

    with patch("requests.get", side_effect=requests.Timeout()):
        t0 = _time.monotonic()
        body = client.get("/admin/api/engine-health", headers=headers).get_json()["deploy"]
    assert body["other"] == "unreachable" and _time.monotonic() - t0 < 3

    app.config.update(ADMIN_PEER_URL="", ADMIN_PEER_TOKEN="")
    body = client.get("/admin/api/engine-health", headers=headers).get_json()["deploy"]
    assert body["other"] == "unreachable — not configured"


def test_the_peer_token_opens_deploy_identity_only_and_is_logged(app, client, caplog):
    import logging

    make_role(app, "seed@levapp.app", "support")  # the signing secret
    app.config.update(ADMIN_PEER_INBOUND_TOKEN="inbound-secret")
    peer = {"Authorization": "Peer inbound-secret"}
    with caplog.at_level(logging.INFO):
        r = client.get("/admin/api/deploy-identity", headers=peer)
    assert r.status_code == 200 and set(r.get_json()) == {"gitSha", "alembicHead"}
    assert any("admin peer read" in m for m in caplog.messages), "a peer read is visible in the log"


@pytest.mark.parametrize("case", ["no header", "wrong token", "token unset", "other endpoint",
                                  "other admin endpoint", "non-GET"])
def test_every_peer_refusal(app, client, case):
    make_role(app, "seed2@levapp.app", "support")
    app.config.update(ADMIN_PEER_INBOUND_TOKEN="" if case == "token unset" else "inbound-secret")
    peer = {"Authorization": "Peer inbound-secret"}
    if case == "no header":
        r = client.get("/admin/api/deploy-identity")
    elif case == "wrong token":
        r = client.get("/admin/api/deploy-identity", headers={"Authorization": "Peer wrong"})
    elif case == "token unset":
        r = client.get("/admin/api/deploy-identity", headers=peer)
    elif case == "other endpoint":
        r = client.get("/admin/api/engine-health", headers=peer)
    elif case == "other admin endpoint":
        r = client.get("/admin/api/roles", headers=peer)
    else:
        r = client.post("/admin/api/deploy-identity", headers=peer)
    assert r.status_code in (401, 405), (case, r.status_code)
    assert "gitSha" not in (r.get_data(as_text=True) or "")


def test_per_coach_settings_are_readable_and_not_writable(app, client):
    headers = bearer(admin_token(app, make_role(app, "olga@levapp.app", "operator")))
    with app.app_context():
        coach_id = _seed_engine()
        from padel_app.models import NotificationConfig
        db.session.add(NotificationConfig(coach_id=coach_id, auto_notify_enabled=True,
                                          invitation_mode="semi_automatic"))
        db.session.commit()
    listed = client.get("/admin/api/engine-health/coaches?q=mar", headers=headers).get_json()["coaches"]
    assert listed == [{"coachId": coach_id, "name": "Maria Coach"}]
    path = f"/admin/api/engine-health/coaches/{coach_id}"
    detail = client.get(path, headers=headers).get_json()
    assert detail["settings"]["invitationMode"] == "semi_automatic"
    assert detail["openVacancies"] == 3 and detail["liveInvitations"] == 3
    assert "email" not in str(detail).lower()
    assert client.put(path, headers=headers, json={"invitationMode": "automatic"}).status_code == 405
    assert client.post(path, headers=headers, json={}).status_code == 405
    with app.app_context():
        from padel_app.models import NotificationConfig
        assert NotificationConfig.query.filter_by(coach_id=coach_id).one().invitation_mode == "semi_automatic"


def test_no_write_route_on_the_page(app):
    rules = [r for r in app.url_map.iter_rules() if r.rule.startswith("/admin/api/engine-health")
             or r.rule == "/admin/api/deploy-identity"]
    assert len(rules) == 4
    for rule in rules:
        assert set(rule.methods) <= {"GET", "HEAD", "OPTIONS"}, rule
