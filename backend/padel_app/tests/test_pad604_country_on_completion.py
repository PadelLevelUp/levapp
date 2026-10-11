"""PAD-604 — the three account-completion paths ask for the country too (Privacy Policy §1):
auth.activate rule 13a, players.invite-completion rule 10a, clubs.coach-invitation rule 8a.

The country is validated as sign-up validates it (auth.register rule 18: two letters, stored
upper-cased). A client declaring `country-on-completion` must send it (400 COUNTRY_REQUIRED); one
that does not (iOS up to 1.3.0 (32)) is accepted without it and the country stays null (PAD-630
asks later). A bad value is refused whatever the client declares. Every refusal writes nothing.

    pytest padel_app/tests/test_pad604_country_on_completion.py -v
"""
import pytest

from padel_app.tests.test_coach_invitation import _make_coach_with_club, _make_invitation
from padel_app.tests.test_pad254_activation_token import _inactive_user, _token
from padel_app.tests.test_player_invitation import _auth_header, make_coach

CAPABLE = {"X-LevApp-Capabilities": "open-spots, coach-invite-email, terms-acceptance, country-on-completion"}
LEGACY = {"X-LevApp-Capabilities": "open-spots, coach-invite-email"}  # iOS 1.3.0 (32) and older
ADULT = "1990-05-05"


@pytest.fixture(autouse=True)
def _jwt_secret(app):
    app.config["JWT_SECRET_KEY"] = "test-jwt-secret"


def _user(app, username=None, user_id=None):
    from padel_app.models import User

    with app.app_context():
        u = User.query.get(user_id) if user_id else User.query.filter_by(username=username).first()
        return None if u is None else {"status": u.status, "country": u.country}


def _refusal(res, code):
    assert res.status_code == 400, res.get_json()
    body = res.get_json()
    assert (body["field"], body["code"]) == ("country", code), body


# ── activation (auth.activate rule 13a) ────────────────────────────────────────

def _activate(client, app, uid, headers, **extra):
    body = {"token": _token(app, uid), "name": "Bruno", "username": "bruno604",
            "password": "NewPass1!", "birthDate": ADULT}
    body.update(extra)
    return client.post(f"/api/app/activate/user/{uid}", json=body, headers=headers)


def test_activation_stores_the_country_upper_cased(client, app):
    uid = _inactive_user(app)
    res = _activate(client, app, uid, CAPABLE, country="es")
    assert res.status_code == 200, res.get_json()
    assert _user(app, user_id=uid) == {"status": "active", "country": "ES"}


def test_activation_without_a_country_is_refused_for_a_declaring_client(client, app):
    uid = _inactive_user(app)
    res = _activate(client, app, uid, CAPABLE)
    _refusal(res, "COUNTRY_REQUIRED")
    assert "/ Update the app" in res.get_json()["error"]
    assert _user(app, user_id=uid)["status"] == "inactive"


def test_activation_refuses_a_country_that_is_not_two_letters(client, app):
    uid = _inactive_user(app)
    _refusal(_activate(client, app, uid, LEGACY, country="Spain"), "INVALID_COUNTRY")
    assert _user(app, user_id=uid)["status"] == "inactive"


def test_a_legacy_build_still_activates_without_a_country(client, app):
    uid = _inactive_user(app)
    res = _activate(client, app, uid, LEGACY)
    assert res.status_code == 200, res.get_json()
    assert _user(app, user_id=uid) == {"status": "active", "country": None}


# ── player invitation (players.invite-completion rule 10a) ──────────────────────

def _player_invite(client, app):
    user_id, coach_id = make_coach(app)
    res = client.post("/api/app/incomplete_player", json={"coachId": coach_id, "name": "Invited P"},
                      headers=_auth_header(app, user_id))
    return res.get_json()["token"]


def _accept_player(client, token, headers, username, **extra):
    body = {"username": username, "password": "Secret123!", "birthDate": ADULT}
    body.update(extra)
    return client.post(f"/api/app/player-invitations/{token}/accept", json=body, headers=headers)


def test_player_invite_stores_the_country(client, app):
    token = _player_invite(client, app)
    res = _accept_player(client, token, CAPABLE, "p604", country="BR")
    assert res.status_code == 200, res.get_json()
    assert _user(app, "p604") == {"status": "active", "country": "BR"}


def test_player_invite_without_a_country_is_refused_and_stays_pending(client, app):
    token = _player_invite(client, app)
    _refusal(_accept_player(client, token, CAPABLE, "p604b"), "COUNTRY_REQUIRED")
    assert _user(app, "p604b") is None
    # Still pending: the same link completes once the country is given.
    res = _accept_player(client, token, CAPABLE, "p604b", country="PT")
    assert res.status_code == 200, res.get_json()


def test_player_invite_from_a_legacy_build_needs_no_country(client, app):
    token = _player_invite(client, app)
    res = _accept_player(client, token, LEGACY, "p604c")
    assert res.status_code == 200, res.get_json()
    assert _user(app, "p604c") == {"status": "active", "country": None}


def test_player_invite_refuses_a_bad_country(client, app):
    token = _player_invite(client, app)
    _refusal(_accept_player(client, token, LEGACY, "p604d", country="P1"), "INVALID_COUNTRY")


# ── coach invitation, new-user branch (clubs.coach-invitation rule 8a) ──────────

def _accept_coach(client, app, headers, username, **extra):
    _, coach_id, club_id = _make_coach_with_club(app)
    token = _make_invitation(app, club_id, coach_id)
    body = {"name": "New Coach", "username": username, "password": "Secret123!",
            "email": f"{username}@example.com", "birthDate": ADULT}
    body.update(extra)
    return client.post(f"/api/app/coach-invitations/{token}/accept", json=body, headers=headers)


def test_coach_invite_stores_the_country(client, app):
    res = _accept_coach(client, app, CAPABLE, "c604", country="pt")
    assert res.status_code == 200, res.get_json()
    assert _user(app, "c604")["country"] == "PT"


def test_coach_invite_without_a_country_creates_no_account(client, app):
    _refusal(_accept_coach(client, app, CAPABLE, "c604b"), "COUNTRY_REQUIRED")
    assert _user(app, "c604b") is None


def test_coach_invite_from_a_legacy_build_needs_no_country(client, app):
    res = _accept_coach(client, app, LEGACY, "c604c")
    assert res.status_code == 200, res.get_json()
    assert _user(app, "c604c")["country"] is None
