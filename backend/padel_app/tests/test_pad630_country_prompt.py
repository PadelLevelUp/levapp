"""PAD-630 — auth.login rule 13: an account with no country is asked for it once after signing in
(web and iOS). The server's part: `GET /api/auth/me` says what the country is, and `PATCH
/api/auth/me` stores one, checked as sign-up checks it (two letters, upper-cased; else 400).
"""
import pytest
from flask_jwt_extended import create_access_token


@pytest.fixture(autouse=True)
def _jwt(app):
    app.config["JWT_SECRET_KEY"] = "test-jwt-secret"


def _user(app, country=None):
    from padel_app.models import Player, User
    from padel_app.sql_db import db

    with app.app_context():
        u = User(name="Bruno", username="bruno630", email="bruno@example.com", password="x",
                 status="active", country=country)
        db.session.add(u)
        db.session.flush()
        db.session.add(Player(user_id=u.id))
        db.session.commit()
        return u.id, {"Authorization": f"Bearer {create_access_token(identity=str(u.id))}"}


def _country(app, uid):
    from padel_app.models import User

    with app.app_context():
        return User.query.get(uid).country


def test_me_says_when_the_country_is_missing(client, app):
    _, headers = _user(app)
    assert client.get("/api/auth/me", headers=headers).get_json()["country"] is None


def test_me_returns_a_stored_country(client, app):
    _, headers = _user(app, country="ES")
    assert client.get("/api/auth/me", headers=headers).get_json()["country"] == "ES"


def test_the_country_is_stored_upper_cased(client, app):
    uid, headers = _user(app)
    res = client.patch("/api/auth/me", json={"country": "br"}, headers=headers)
    assert res.status_code == 200, res.get_json()
    assert res.get_json()["country"] == "BR"
    assert _country(app, uid) == "BR"


@pytest.mark.parametrize("bad", ["Brazil", "B", "12", "", None])
def test_a_country_that_is_not_two_letters_is_refused(client, app, bad):
    uid, headers = _user(app, country="PT")
    res = client.patch("/api/auth/me", json={"country": bad}, headers=headers)
    assert res.status_code == 400, res.get_json()
    assert _country(app, uid) == "PT"


def test_other_profile_fields_still_update_without_touching_the_country(client, app):
    uid, headers = _user(app, country="PT")
    res = client.patch("/api/auth/me", json={"name": "Bruno Silva"}, headers=headers)
    assert res.status_code == 200
    assert _country(app, uid) == "PT"
