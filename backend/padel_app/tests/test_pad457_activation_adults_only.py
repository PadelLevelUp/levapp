"""PAD-457 — auth.activate rule 13: a coach-created player gives their birth date at activation,
and nobody under 18 is activated (the same bar as sign-up, auth.register rule 18).

Every refusal writes nothing: the account stays `inactive`, no password is set.

    pytest padel_app/tests/test_pad457_activation_adults_only.py -v
"""
from datetime import date, datetime

import pytest

from padel_app.tests.helpers import pin_clock
from padel_app.tests.test_pad254_activation_token import _fresh, _inactive_user, _token

UNDERAGE = (
    "Data de nascimento inválida. Esta app só aceita maiores de 18 anos. "
    "/ Invalid date of birth. This app only accepts people aged 18 or over."
)


def _activate(client, app, user_id, **extra):
    body = {"token": _token(app, user_id), "name": "Bruno", "username": "bruno457",
            "password": "NewPass1!"}
    body.update(extra)
    return client.post(f"/api/app/activate/user/{user_id}", json=body)


def _birth(app, user_id):
    from padel_app.models import User

    with app.app_context():
        return User.query.get(user_id).birth_date


def test_under_18_is_refused_and_nothing_is_written(client, app, monkeypatch):
    pin_clock(monkeypatch, datetime(2026, 9, 25, 12, 0))
    uid = _inactive_user(app)
    res = _activate(client, app, uid, birthDate="2008-09-26")
    assert res.status_code == 400, res.get_json()
    body = res.get_json()
    assert (body["field"], body["code"], body["error"]) == ("birthDate", "UNDERAGE", UNDERAGE)
    after = _fresh(app, uid)
    assert after["status"] == "inactive" and after["password"] in (None, "")
    assert _birth(app, uid) is None


def test_turning_18_today_activates_and_stores_the_date(client, app, monkeypatch):
    pin_clock(monkeypatch, datetime(2026, 9, 25, 12, 0))
    uid = _inactive_user(app)
    res = _activate(client, app, uid, birthDate="2008-09-25")
    assert res.status_code == 200, res.get_json()
    assert _fresh(app, uid)["status"] == "active"
    assert _birth(app, uid) == date(2008, 9, 25)


def test_no_birth_date_is_refused_with_the_update_the_app_text(client, app):
    uid = _inactive_user(app)
    res = _activate(client, app, uid)
    assert res.status_code == 400
    body = res.get_json()
    assert (body["field"], body["code"]) == ("birthDate", "BIRTH_DATE_REQUIRED")
    assert "Atualiza a app" in body["error"] and "Update the app" in body["error"]
    assert _fresh(app, uid)["status"] == "inactive"


@pytest.mark.parametrize("bad", ["2027-01-01", "25/09/2000", "2001-02-30"])
def test_an_invalid_date_is_refused(client, app, bad):
    uid = _inactive_user(app)
    res = _activate(client, app, uid, birthDate=bad)
    assert res.status_code == 400
    assert res.get_json()["code"] == "INVALID_BIRTH_DATE"
    assert _fresh(app, uid)["status"] == "inactive"
