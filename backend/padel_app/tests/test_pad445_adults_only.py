"""PAD-445 — auth.register rule 18: LevApp accepts adults only.

Anyone under 18 on the request's UTC date is refused with 400 `UNDERAGE` on `birthDate`, and
nothing is written: no User, no Player/Coach, no GuardianConsent, no mail. It holds whatever the
country's digital-consent age, so a minor never reaches the guardian branch of
auth.parental-consent rule 3. Someone who turns 18 today signs up.

    pytest padel_app/tests/test_pad445_adults_only.py -v
"""
from datetime import datetime

import pytest

from padel_app.sql_db import db
from padel_app.tests.helpers import pin_clock

MESSAGE = (
    "Data de nascimento inválida. Esta app só aceita maiores de 18 anos. "
    "/ Invalid date of birth. This app only accepts people aged 18 or over."
)


@pytest.fixture(autouse=True)
def _jwt_secret(app):
    app.config["JWT_SECRET_KEY"] = "test-jwt-secret"


@pytest.fixture(autouse=True)
def consent_ages(app):
    """The migration seeds these; create_all in tests does not."""
    from padel_app.models import DigitalConsentAge

    with app.app_context():
        for country, age in (("PT", 13), ("DE", 16)):
            db.session.add(DigitalConsentAge(country=country, age=age))
        db.session.commit()


@pytest.fixture
def outbox(monkeypatch):
    from padel_app.tools import email_tools

    sent = []
    monkeypatch.setattr(email_tools, "send_email",
                        lambda subject, recipients, body=None, html=None: sent.append(list(recipients)) or "Sent")
    return sent


def _body(birth, username="teen", country="PT", role="student", **over):
    body = {"role": role, "name": "Teen Silva", "username": username, "email": f"{username}@example.com",
            "password": "Segura123", "birthDate": birth, "country": country}
    body.update(over)
    return body


def _nothing_written(app, username):
    from padel_app.models import GuardianConsent, User

    with app.app_context():
        assert User.query.filter_by(username=username).first() is None
        assert GuardianConsent.query.count() == 0


def test_a_day_short_of_18_is_refused_and_nothing_is_written(client, app, outbox, monkeypatch):
    pin_clock(monkeypatch, datetime(2026, 9, 25, 12, 0))
    res = client.post("/api/auth/register", json=_body("2008-09-26", guardianEmail="mae@example.com"))
    assert res.status_code == 400, res.get_json()
    body = res.get_json()
    assert body["field"] == "birthDate"
    assert body["code"] == "UNDERAGE"
    assert body["error"] == MESSAGE
    assert "accessToken" not in body
    _nothing_written(app, "teen")
    assert outbox == []


def test_turning_18_today_signs_up(client, app, outbox, monkeypatch):
    from padel_app.models import User

    pin_clock(monkeypatch, datetime(2026, 9, 25, 12, 0))
    res = client.post("/api/auth/register", json=_body("2008-09-25", username="adult"))
    assert res.status_code == 201, res.get_json()
    assert res.get_json()["accessToken"]
    with app.app_context():
        assert User.query.filter_by(username="adult").first().guardian_consent_status is None


@pytest.mark.parametrize("today, status", [(datetime(2026, 2, 28, 12, 0), 400), (datetime(2026, 3, 1, 12, 0), 201)])
def test_a_29_february_birth_is_18_on_1_march(client, app, outbox, monkeypatch, today, status):
    pin_clock(monkeypatch, today)
    res = client.post("/api/auth/register", json=_body("2008-02-29", username="leap"))
    assert res.status_code == status, res.get_json()
    if status == 400:
        assert res.get_json()["code"] == "UNDERAGE"


def test_the_bar_ignores_the_country_consent_age(client, app, outbox, monkeypatch):
    """A 16-year-old in DE is past DE's digital-consent age, and in PT a 14-year-old is past PT's
    13: neither signs up, with or without a guardian's email."""
    pin_clock(monkeypatch, datetime(2026, 9, 25, 12, 0))
    de = client.post("/api/auth/register", json=_body("2010-01-01", username="de16", country="DE",
                                                      guardianEmail="g@example.com"))
    pt = client.post("/api/auth/register", json=_body("2012-01-01", username="pt14", country="PT"))
    assert (de.status_code, de.get_json().get("code")) == (400, "UNDERAGE")
    assert (pt.status_code, pt.get_json().get("code")) == (400, "UNDERAGE")
    _nothing_written(app, "de16")
    _nothing_written(app, "pt14")


def test_a_coach_under_18_is_refused_too(client, app, outbox, monkeypatch):
    pin_clock(monkeypatch, datetime(2026, 9, 25, 12, 0))
    res = client.post("/api/auth/register", json=_body("2009-01-01", username="kidcoach", role="coach"))
    assert (res.status_code, res.get_json().get("code")) == (400, "UNDERAGE")
    _nothing_written(app, "kidcoach")


def test_an_invalid_date_is_still_invalid_not_underage(client, app, outbox, monkeypatch):
    pin_clock(monkeypatch, datetime(2026, 9, 25, 12, 0))
    res = client.post("/api/auth/register", json=_body("2027-01-01", username="future"))
    assert (res.status_code, res.get_json().get("code")) == (400, "INVALID_BIRTH_DATE")
