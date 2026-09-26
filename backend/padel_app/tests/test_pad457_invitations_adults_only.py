"""PAD-457 — the two invitation paths that create a login also refuse anyone under 18
(players.invite-completion rule 10, clubs.coach-invitation rule 8; the same shared check as
auth.register rule 18 and auth.activate rule 13).

    pytest padel_app/tests/test_pad457_invitations_adults_only.py -v
"""
from datetime import date, datetime

import pytest

from padel_app.tests.helpers import pin_clock
from padel_app.tests.test_coach_invitation import _make_coach_with_club, _make_invitation
from padel_app.tests.test_player_invitation import _auth_header, make_coach

NOW = datetime(2026, 9, 25, 12, 0)


@pytest.fixture(autouse=True)
def _jwt_secret(app):
    app.config["JWT_SECRET_KEY"] = "test-jwt-secret"


def _player_invite(client, app):
    user_id, coach_id = make_coach(app)
    res = client.post("/api/app/incomplete_player", json={"coachId": coach_id, "name": "Invited P"},
                      headers=_auth_header(app, user_id))
    return res.get_json()["token"]


def _user(app, username):
    from padel_app.models import User

    with app.app_context():
        u = User.query.filter_by(username=username).first()
        return None if u is None else {"status": u.status, "birth_date": u.birth_date}


# ── player invitation ──────────────────────────────────────────────────────────

def test_player_invite_refuses_under_18_and_writes_nothing(client, app, monkeypatch):
    pin_clock(monkeypatch, NOW)
    token = _player_invite(client, app)
    res = client.post(f"/api/app/player-invitations/{token}/accept",
                      json={"username": "teen457", "password": "Secret123!", "birthDate": "2008-09-26"})
    assert res.status_code == 400, res.get_json()
    assert (res.get_json()["field"], res.get_json()["code"]) == ("birthDate", "UNDERAGE")
    assert _user(app, "teen457") is None  # the placeholder was not given this username


def test_player_invite_accepts_18_today_and_stores_the_date(client, app, monkeypatch):
    pin_clock(monkeypatch, NOW)
    token = _player_invite(client, app)
    res = client.post(f"/api/app/player-invitations/{token}/accept",
                      json={"username": "adult457", "password": "Secret123!", "birthDate": "2008-09-25"})
    assert res.status_code == 200, res.get_json()
    assert _user(app, "adult457") == {"status": "active", "birth_date": date(2008, 9, 25)}


def test_player_invite_without_a_birth_date_is_refused(client, app):
    token = _player_invite(client, app)
    res = client.post(f"/api/app/player-invitations/{token}/accept",
                      json={"username": "nodate457", "password": "Secret123!"})
    assert res.status_code == 400
    assert res.get_json()["code"] == "BIRTH_DATE_REQUIRED"
    assert _user(app, "nodate457") is None


# ── coach invitation, new-user branch ────────────────────────────────────────────

def test_coach_invite_refuses_under_18_and_creates_no_account(client, app, monkeypatch):
    pin_clock(monkeypatch, NOW)
    _, coach_id, club_id = _make_coach_with_club(app)
    token = _make_invitation(app, club_id, coach_id)
    res = client.post(f"/api/app/coach-invitations/{token}/accept",
                      json={"name": "Teen Coach", "username": "teencoach457", "password": "Secret123!",
                            "birthDate": "2009-01-01"})
    assert res.status_code == 400, res.get_json()
    assert res.get_json()["code"] == "UNDERAGE"
    assert _user(app, "teencoach457") is None


def test_coach_invite_accepts_an_adult_and_stores_the_date(client, app, monkeypatch):
    pin_clock(monkeypatch, NOW)
    _, coach_id, club_id = _make_coach_with_club(app)
    token = _make_invitation(app, club_id, coach_id)
    res = client.post(f"/api/app/coach-invitations/{token}/accept",
                      json={"name": "New Coach", "username": "newcoach457", "password": "Secret123!",
                            "birthDate": "1990-05-05"})
    assert res.status_code == 200, res.get_json()
    assert _user(app, "newcoach457") == {"status": "active", "birth_date": date(1990, 5, 5)}
