"""PAD-640 — settings.profile rules 10–11: everyone corrects their own date of birth and country in
Perfil. `PATCH /api/auth/me` judges the birth date with sign-up's one check (auth.register rule 18):
an under-18 date is 400 UNDERAGE on `birthDate`, and nothing in that PATCH is written.
"""
from datetime import date

import pytest
from flask_jwt_extended import create_access_token


@pytest.fixture(autouse=True)
def _jwt(app):
    app.config["JWT_SECRET_KEY"] = "test-jwt-secret"


def _user(app, birth=date(1990, 5, 1)):
    from padel_app.models import Player, User
    from padel_app.sql_db import db

    with app.app_context():
        u = User(name="Sara", username="sara640", email="sara640@example.com", password="x",
                 status="active", country="PT", birth_date=birth)
        db.session.add(u)
        db.session.flush()
        db.session.add(Player(user_id=u.id))
        db.session.commit()
        return u.id, {"Authorization": f"Bearer {create_access_token(identity=str(u.id))}"}


def _stored(app, uid):
    from padel_app.models import User

    with app.app_context():
        u = User.query.get(uid)
        return u.birth_date, u.country, u.name


def _seventeen_today():
    t = date.today()
    return date(t.year - 17, t.month, 1).isoformat()


def test_me_returns_the_birth_date(client, app):
    _, headers = _user(app)
    assert client.get("/api/auth/me", headers=headers).get_json()["birthDate"] == "1990-05-01"


def test_an_adult_changes_their_birth_date_and_country(client, app):
    uid, headers = _user(app)
    res = client.patch("/api/auth/me", json={"birthDate": "1991-06-02", "country": "ES"}, headers=headers)
    assert res.status_code == 200, res.get_json()
    assert res.get_json()["birthDate"] == "1991-06-02"
    assert _stored(app, uid)[:2] == (date(1991, 6, 2), "ES")


def test_an_under_18_date_is_refused_and_nothing_in_the_patch_is_written(client, app):
    uid, headers = _user(app)
    res = client.patch("/api/auth/me", json={"birthDate": _seventeen_today(), "name": "Outra"}, headers=headers)
    assert res.status_code == 400
    body = res.get_json()
    assert body["code"] == "UNDERAGE" and body["field"] == "birthDate"
    assert "18" in body["error"]
    assert _stored(app, uid) == (date(1990, 5, 1), "PT", "Sara")


@pytest.mark.parametrize("bad", ["", None, "2001-02-30", "01/02/2001", "2999-01-01"])
def test_an_empty_or_malformed_date_is_refused_and_never_clears_it(client, app, bad):
    uid, headers = _user(app)
    res = client.patch("/api/auth/me", json={"birthDate": bad}, headers=headers)
    assert res.status_code == 400
    assert res.get_json()["code"] == "INVALID_BIRTH_DATE"
    assert _stored(app, uid)[0] == date(1990, 5, 1)


def test_an_account_with_no_birth_date_can_set_one(client, app):
    uid, headers = _user(app, birth=None)
    res = client.patch("/api/auth/me", json={"birthDate": "1985-01-31"}, headers=headers)
    assert res.status_code == 200, res.get_json()
    assert _stored(app, uid)[0] == date(1985, 1, 31)


def test_a_patch_without_the_birth_date_leaves_it_alone(client, app):
    uid, headers = _user(app)
    assert client.patch("/api/auth/me", json={"name": "Sara Lima"}, headers=headers).status_code == 200
    assert _stored(app, uid) == (date(1990, 5, 1), "PT", "Sara Lima")
