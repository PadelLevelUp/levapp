"""
PAD-750 (B-671) — the reminder debug endpoint across a daylight-saving change.

``debug_schedule_reminder_test`` (notification_engine_api.py) builds a class whose 48 h reminder
fires ``secondsUntilReminderFires`` from now; E2E specs wait that long for it. The engine counts the
48 h back in real hours (``scheduler._fire_time_utc``, PAD-256), so the class has to sit 48 real
hours plus ``s`` ahead. Built on the wall clock instead, the reminder fired an hour late whenever the
48 h crossed Lisbon's autumn change (2026-10-23 07:12 UTC: 3605 s, not 5 s) and an hour early across
the spring change.
"""
from datetime import datetime, timedelta
from unittest.mock import patch

import pytest
from flask_jwt_extended import create_access_token

from padel_app.sql_db import db
from padel_app.tests.helpers import pin_clock

CREATE_PATH = "/api/app/notify/debug/schedule_reminder_test"
REMINDER_48H = {"type": "hours_before", "value": 48}


@pytest.fixture(autouse=True)
def _debug_gate(app):
    app.config["JWT_SECRET_KEY"] = "test-jwt-secret"
    app.config["E2E_DEBUG_ENDPOINTS"] = "true"


def _seed_coach(app):
    from padel_app.models import User
    from padel_app.models.clubs import Club
    from padel_app.models.coaches import Coach
    from padel_app.models.players import Player

    with app.app_context():
        db.session.add(Club(name="PAD-750 Club", description="", location="City"))
        users = [User(name=n, username=n, password="x")
                 for n in ("e2e-coach", "e2e-student", "e2e-student-2")]
        db.session.add_all(users)
        db.session.flush()
        db.session.add_all([Coach(user_id=users[0].id), Player(user_id=users[1].id),
                            Player(user_id=users[2].id)])
        db.session.commit()
        return users[0].id


@pytest.mark.parametrize("now", [
    datetime(2026, 10, 23, 7, 12, 41),   # the 48 h end after the 25 Oct 2026 fall-back
    datetime(2027, 3, 26, 9, 0, 0),      # the 48 h end after the 28 Mar 2027 spring-forward
    datetime(2026, 7, 1, 9, 0, 0),       # no change in the window
], ids=["autumn-change", "spring-change", "no-change"])
def test_the_48h_reminder_fires_the_asked_seconds_from_now(app, client, monkeypatch, now):
    from padel_app.models.lesson_instances import LessonInstance
    from padel_app.scheduler import _fire_time_utc

    pin_clock(monkeypatch, now)
    coach_user_id = _seed_coach(app)
    with app.app_context():
        headers = {"Authorization": f"Bearer {create_access_token(identity=str(coach_user_id))}"}
    with patch("padel_app.scheduler.ensure_scheduler_ready"):
        res = client.post(CREATE_PATH, json={"secondsUntilReminderFires": 5}, headers=headers)
    assert res.status_code == 200, res.get_json()

    with app.app_context():
        instance = db.session.get(LessonInstance, res.get_json()["instanceId"])
        assert _fire_time_utc(instance.start_datetime, REMINDER_48H) == now + timedelta(seconds=5)
