"""
PAD-451 — notifications.config rule 6a: the coach sets the quiet window.

`quietHours` is `{enabled, start, end}` in 30-minute steps, default 22:00–07:00, club-local
(Europe/Lisbon), `[start, end)`, and it may cross midnight. Invalid bounds are refused with 400; an
older app's save (no start/end) keeps the stored bounds. Held vacancies (rule 6d) go out at `end`.

June is WEST (UTC+1): 06:30Z is 07:30 in Lisbon.
"""
from datetime import datetime
from unittest.mock import patch

import pytest
from flask_jwt_extended import create_access_token

from padel_app.sql_db import db
from padel_app.tests.test_pad451_quiet_hours_hold_the_sweep import PATCHES, _seed, _sent


def _allowed(restrictions, utc):
    from padel_app.services.notification_service import _check_restrictions

    instance = type("I", (), {"id": 0, "start_datetime": datetime(2026, 6, 20, 9, 0)})()
    return _check_restrictions(instance, 1, restrictions, now=utc)


def _quiet(start, end):
    return {"quietHours": {"enabled": True, "start": start, "end": end}}


@pytest.mark.parametrize("utc, allowed", [
    (datetime(2026, 6, 10, 6, 30), False),   # 07:30 Lisbon: inside 23:00-08:00
    (datetime(2026, 6, 10, 7, 0), True),     # 08:00: the window's end, allowed
    (datetime(2026, 6, 10, 21, 59), True),   # 22:59: before the start
    (datetime(2026, 6, 10, 22, 0), False),   # 23:00: the start, refused
])
def test_a_window_crossing_midnight(app, utc, allowed):
    with app.app_context():
        assert _allowed(_quiet("23:00", "08:00"), utc) is allowed


@pytest.mark.parametrize("utc, allowed", [
    (datetime(2026, 6, 10, 11, 59), True),   # 12:59
    (datetime(2026, 6, 10, 12, 0), False),   # 13:00
    (datetime(2026, 6, 10, 13, 30), False),  # 14:30
    (datetime(2026, 6, 10, 14, 0), True),    # 15:00
])
def test_a_window_inside_one_day(app, utc, allowed):
    with app.app_context():
        assert _allowed(_quiet("13:00", "15:00"), utc) is allowed


def test_no_bounds_means_the_default_window(app):
    with app.app_context():
        assert _allowed({"quietHours": {"enabled": True}}, datetime(2026, 6, 10, 21, 0)) is False  # 22:00
        assert _allowed({"quietHours": {"enabled": True}}, datetime(2026, 6, 10, 6, 0)) is True    # 07:00


# ── the API ───────────────────────────────────────────────────────────────────

@pytest.fixture
def coach_headers(app):
    from padel_app.models import User
    from padel_app.models.coaches import Coach

    app.config["JWT_SECRET_KEY"] = "test-jwt-secret"
    with app.app_context():
        u = User(name="Coach Q", username="coachq451", email="coachq451@t.test", password="x", status="active")
        db.session.add(u)
        db.session.flush()
        db.session.add(Coach(user_id=u.id))
        db.session.commit()
        return {"Authorization": f"Bearer {create_access_token(identity=str(u.id))}"}


def _get(client, headers):
    return client.get("/api/app/notify/config", headers=headers).get_json()["restrictions"]["quietHours"]


def _post_quiet(client, headers, quiet):
    restrictions = client.get("/api/app/notify/config", headers=headers).get_json()["restrictions"]
    restrictions["quietHours"] = quiet
    return client.post("/api/app/notify/config", json={"restrictions": restrictions}, headers=headers)


def test_the_window_round_trips(client, coach_headers):
    assert _get(client, coach_headers) == {"enabled": False, "start": "22:00", "end": "07:00"}
    res = _post_quiet(client, coach_headers, {"enabled": True, "start": "23:00", "end": "08:00"})
    assert res.status_code == 200
    assert _get(client, coach_headers) == {"enabled": True, "start": "23:00", "end": "08:00"}


@pytest.mark.parametrize("bad", [
    {"enabled": True, "start": "22:00", "end": "22:00"},
    {"enabled": True, "start": "22:15", "end": "07:00"},
    {"enabled": True, "start": "22:00", "end": "25:00"},
    {"enabled": True, "start": "10pm", "end": "07:00"},
])
def test_invalid_bounds_are_refused_and_nothing_is_stored(client, coach_headers, bad):
    _post_quiet(client, coach_headers, {"enabled": True, "start": "23:00", "end": "08:00"})
    res = _post_quiet(client, coach_headers, bad)
    assert res.status_code == 400
    assert _get(client, coach_headers) == {"enabled": True, "start": "23:00", "end": "08:00"}


def test_an_older_apps_save_keeps_the_bounds(client, coach_headers):
    _post_quiet(client, coach_headers, {"enabled": True, "start": "23:00", "end": "08:00"})
    res = _post_quiet(client, coach_headers, {"enabled": False})
    assert res.status_code == 200
    assert _get(client, coach_headers) == {"enabled": False, "start": "23:00", "end": "08:00"}


# ── held vacancies go out at the window's end (rule 6d) ────────────────────────

def test_a_held_vacancy_goes_out_at_the_custom_end(app):
    from padel_app.models.notification_config import NotificationConfig
    from padel_app.models.vacancy import Vacancy
    from padel_app.services.notification_service import process_invitation_batches

    with app.app_context(), patch(PATCHES[0]), patch(PATCHES[1]):
        vid = _seed(quiet=True)
        cfg = NotificationConfig.query.filter_by(coach_id=Vacancy.query.get(vid).coach_id).first()
        r = cfg.get_restrictions()
        r["quietHours"] = {"enabled": True, "start": "23:00", "end": "08:00"}
        cfg.restrictions = r
        db.session.commit()
        process_invitation_batches(now=datetime(2026, 6, 11, 6, 30))  # 07:30 Lisbon: still quiet
        assert _sent(vid) == 0
        process_invitation_batches(now=datetime(2026, 6, 11, 7, 0))   # 08:00: the end
        assert _sent(vid) == 1
