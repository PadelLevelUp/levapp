"""auth.parental-consent — a minor's self-sign-up waits for a guardian (PAD-198)."""
import re
from datetime import date, datetime, timedelta

import pytest
from flask_jwt_extended import create_access_token

from padel_app.sql_db import db

TODAY = date.today()
ADULT_BIRTH = "2000-01-01"
MINOR_BIRTH = f"{TODAY.year - 10}-01-01"          # age 10
AGE14_BIRTH = f"{TODAY.year - 14}-01-01"          # age 14


@pytest.fixture(autouse=True)
def _jwt_secret(app):
    app.config["JWT_SECRET_KEY"] = "test-jwt-secret"


@pytest.fixture(autouse=True)
def consent_ages(app):
    """The migration seeds these; create_all in tests does not."""
    from padel_app.models import DigitalConsentAge

    with app.app_context():
        for country, age in (("PT", 13), ("ES", 14), ("DE", 16)):
            db.session.add(DigitalConsentAge(country=country, age=age))
        db.session.commit()


@pytest.fixture
def outbox(monkeypatch):
    from padel_app.tools import email_tools

    sent = []

    def fake(subject, recipients, body=None, html=None):
        sent.append({"subject": subject, "recipients": list(recipients), "body": body or "", "html": html})
        return "Sent"

    monkeypatch.setattr(email_tools, "send_email", fake)
    return sent


def _body(role="student", username="rita", email="rita@example.com", birth=MINOR_BIRTH,
          country="PT", guardian="mae@example.com", **over):
    body = {"role": role, "name": "Rita Sousa", "username": username, "email": email,
            "password": "Segura123", "birthDate": birth, "country": country}
    if guardian is not None:
        body["guardianEmail"] = guardian
    body.update(over)
    return body


def _mails_to(outbox, address):
    return [m for m in outbox if address in m["recipients"]]


def _consent_token(outbox, guardian="mae@example.com"):
    mail = _mails_to(outbox, guardian)[-1]
    return re.search(r"/guardian-consent/([A-Za-z0-9_\-]{20,})", mail["body"]).group(1)


def _revoke_token(outbox, guardian="mae@example.com"):
    for mail in reversed(_mails_to(outbox, guardian)):
        m = re.search(r"/guardian-consent/revoke/([A-Za-z0-9_\-]{20,})", mail["body"])
        if m:
            return m.group(1)
    raise AssertionError("no revoke link mailed")


def _user(app, username="rita"):
    from padel_app.models import User

    with app.app_context():
        return User.query.filter_by(username=username).first()


def _user_by_id(app, user_id):
    """By id: account deletion renames the username (auth.account-deletion rule 2)."""
    from padel_app.models import User

    with app.app_context():
        return User.query.get(user_id)


def _login(client, username="rita", password="Segura123"):
    return client.post("/api/auth/login", json={"username": username, "password": password})


def _consent(client, token, **over):
    body = {"guardianName": "Maria Silva", "relationship": "parent",
            "confirmMinorDetails": True, "acceptTerms": True}
    body.update(over)
    return client.post(f"/api/auth/guardian-consent/{token}", json=body)


# --- An adult signs up exactly as before -----------------------------------

def test_adult_signs_up_as_before(client, app, outbox):
    res = client.post("/api/auth/register", json=_body(birth=ADULT_BIRTH, guardian=None))
    assert res.status_code == 201, res.get_json()
    assert res.get_json()["accessToken"]
    user = _user(app)
    assert user.birth_date == date(2000, 1, 1)
    assert user.country == "PT"
    assert user.guardian_consent_status is None


# --- A minor's account waits for the guardian ------------------------------

def test_minor_account_waits_for_guardian(client, app, outbox):
    res = client.post("/api/auth/register", json=_body())
    assert res.status_code == 201, res.get_json()
    body = res.get_json()
    assert "accessToken" not in body
    assert body["guardianConsent"] == "pending"
    assert body["user"]["guardianConsent"] == "pending"
    assert body["guardianEmail"] != "mae@example.com" and body["guardianEmail"].endswith("@example.com")
    assert body["resendAvailableInSeconds"] == 60
    guardian_mails = _mails_to(outbox, "mae@example.com")
    assert len(guardian_mails) == 1 and "/guardian-consent/" in guardian_mails[0]["body"]
    assert _mails_to(outbox, "rita@example.com") == []  # no verification code before consent
    res = _login(client)
    assert res.status_code == 403
    assert res.get_json()["error"] == "GUARDIAN_CONSENT_PENDING"
    assert "accessToken" not in res.get_json()
    user = _user(app)
    assert user.guardian_consent_status == "pending"
    assert user.email_verification_required is True


def test_token_of_pending_minor_is_refused(client, app, outbox):
    client.post("/api/auth/register", json=_body())
    user = _user(app)
    with app.app_context():
        token = create_access_token(identity=str(user.id))
    assert client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"}).status_code == 401


# --- The age follows the country and is editable without a deploy ----------

def test_age_follows_country_and_table(client, app, outbox):
    from padel_app.models import DigitalConsentAge

    es = client.post("/api/auth/register", json=_body(username="es14", email="es14@example.com",
                                                      birth=AGE14_BIRTH, country="ES", guardian=None))
    assert es.status_code == 201 and es.get_json().get("accessToken"), es.get_json()
    de = client.post("/api/auth/register", json=_body(username="de14", email="de14@example.com",
                                                      birth=AGE14_BIRTH, country="DE", guardian="g1@example.com"))
    assert de.status_code == 201 and de.get_json()["guardianConsent"] == "pending"
    zz = client.post("/api/auth/register", json=_body(username="zz14", email="zz14@example.com",
                                                      birth=AGE14_BIRTH, country="ZZ", guardian="g2@example.com"))
    assert zz.status_code == 201 and zz.get_json()["guardianConsent"] == "pending"
    with app.app_context():
        DigitalConsentAge.query.filter_by(country="DE").first().age = 14
        db.session.commit()
    de2 = client.post("/api/auth/register", json=_body(username="de14b", email="de14b@example.com",
                                                       birth=AGE14_BIRTH, country="DE", guardian=None))
    assert de2.status_code == 201 and de2.get_json().get("accessToken"), de2.get_json()


# --- Sign-up validation names the field ------------------------------------

@pytest.mark.parametrize("over, field", [
    ({"birthDate": None}, "birthDate"),
    ({"birthDate": (TODAY + timedelta(days=1)).isoformat()}, "birthDate"),
    ({"birthDate": "10/05/2016"}, "birthDate"),
    ({"country": None}, "country"),
    ({"country": "Portugal"}, "country"),
    ({"guardianEmail": None}, "guardianEmail"),
    ({"guardianEmail": "not-an-email"}, "guardianEmail"),
    ({"guardianEmail": "RITA@example.com"}, "guardianEmail"),
])
def test_signup_validation_names_the_field(client, app, outbox, over, field):
    from padel_app.models import User

    body = _body()
    for key, value in over.items():
        if value is None:
            body.pop(key, None)
        else:
            body[key] = value
    res = client.post("/api/auth/register", json=body)
    assert res.status_code == 400, res.get_json()
    assert res.get_json()["field"] == field
    with app.app_context():
        assert User.query.filter_by(username="rita").first() is None


@pytest.mark.parametrize("missing, code", [("birthDate", "BIRTH_DATE_REQUIRED"), ("country", "COUNTRY_REQUIRED")])
def test_absent_field_tells_old_apps_to_update(client, app, outbox, missing, code):
    body = _body()
    body.pop(missing)
    res = client.post("/api/auth/register", json=body)
    assert res.status_code == 400
    data = res.get_json()
    assert data["code"] == code and data["field"] == missing
    assert "Atualiza a app" in data["error"] and "Update the app" in data["error"]


# --- The guardian consents from the email link -----------------------------

def test_guardian_consents(client, app, outbox):
    from padel_app.models import GuardianConsent

    client.post("/api/auth/register", json=_body())
    token = _consent_token(outbox)

    view = client.get(f"/api/auth/guardian-consent/{token}")
    assert view.status_code == 200, view.get_json()
    data = view.get_json()
    assert data["minor"]["username"] == "rita"
    assert data["minor"]["birthDate"] == MINOR_BIRTH
    assert data["minor"]["country"] == "PT"
    assert data["termsVersion"] == "2026-09-06"
    assert _user(app).guardian_consent_status == "pending"  # opening changes nothing

    res = _consent(client, token)
    assert res.status_code == 200, res.get_json()
    user = _user(app)
    assert user.guardian_consent_status == "granted"
    with app.app_context():
        row = GuardianConsent.query.filter_by(user_id=user.id).first()
        assert row.guardian_name == "Maria Silva"
        assert row.relationship == "parent"
        assert row.guardian_email == "mae@example.com"
        assert row.consented_at is not None and row.consent_ip
        assert row.terms_version == "2026-09-06"
        assert row.revoke_token_hash and row.consent_token_hash  # kept only to answer 409
        assert '"username": "rita"' in row.minor_snapshot
    minor_mails = _mails_to(outbox, "rita@example.com")
    assert len(minor_mails) == 1 and re.search(r"\b\d{6}\b", minor_mails[0]["body"])
    assert "/guardian-consent/revoke/" in _mails_to(outbox, "mae@example.com")[-1]["body"]

    login = _login(client)
    assert login.status_code == 200, login.get_json()
    me = client.get("/api/auth/me", headers={"Authorization": f"Bearer {login.get_json()['accessToken']}"}).get_json()
    assert me["emailVerification"] == "pending"
    assert me["guardianConsent"] == "granted"
    assert client.get(f"/api/auth/guardian-consent/{token}").status_code == 409


def test_minor_coach_admin_notified_only_on_consent(client, app, outbox):
    app.config["ADMIN_NOTIFY_EMAIL"] = "admin@levapp.app"
    client.post("/api/auth/register", json=_body(role="coach"))
    assert _mails_to(outbox, "admin@levapp.app") == []
    _consent(client, _consent_token(outbox))
    assert len(_mails_to(outbox, "admin@levapp.app")) == 1


# --- Consent requires every declaration ------------------------------------

@pytest.mark.parametrize("over, field", [
    ({"guardianName": ""}, "guardianName"),
    ({"relationship": "uncle"}, "relationship"),
    ({"confirmMinorDetails": False}, "confirmMinorDetails"),
    ({"acceptTerms": False}, "acceptTerms"),
])
def test_consent_requires_every_declaration(client, app, outbox, over, field):
    client.post("/api/auth/register", json=_body())
    res = _consent(client, _consent_token(outbox), **over)
    assert res.status_code == 400
    assert res.get_json()["field"] == field
    assert _user(app).guardian_consent_status == "pending"


# --- Links expire and resend replaces them ---------------------------------

def test_link_expires(client, app, outbox):
    from padel_app.models import GuardianConsent

    client.post("/api/auth/register", json=_body())
    token = _consent_token(outbox)
    with app.app_context():
        row = GuardianConsent.query.first()
        row.consent_expires_at = datetime.utcnow() - timedelta(minutes=1)
        db.session.commit()
    res = client.get(f"/api/auth/guardian-consent/{token}")
    assert res.status_code == 410 and res.get_json()["error"] == "CONSENT_LINK_EXPIRED"
    assert _consent(client, token).status_code == 410


def test_resend_cooldown_and_replacement(client, app, outbox):
    from padel_app.models import GuardianConsent

    client.post("/api/auth/register", json=_body())
    old = _consent_token(outbox)
    res = client.post("/api/auth/guardian-consent/resend", json={"username": "rita", "password": "Segura123"})
    assert res.status_code == 429 and res.get_json()["error"] == "RESEND_TOO_SOON"
    assert res.get_json()["retryAfterSeconds"] > 0
    with app.app_context():
        GuardianConsent.query.first().consent_sent_at = datetime.utcnow() - timedelta(seconds=61)
        db.session.commit()
    res = client.post("/api/auth/guardian-consent/resend",
                      json={"username": "rita", "password": "Segura123", "guardianEmail": "pai@example.com"})
    assert res.status_code == 200, res.get_json()
    assert res.get_json()["resendAvailableInSeconds"] == 60
    new = _consent_token(outbox, guardian="pai@example.com")
    assert new != old
    assert client.get(f"/api/auth/guardian-consent/{old}").status_code == 410
    assert client.get(f"/api/auth/guardian-consent/{new}").status_code == 200


def test_resend_checks_credentials_and_state(client, app, outbox):
    client.post("/api/auth/register", json=_body())
    assert client.post("/api/auth/guardian-consent/resend",
                       json={"username": "rita", "password": "wrong"}).status_code == 401
    client.post("/api/auth/register", json=_body(username="adulta", email="adulta@example.com",
                                                 birth=ADULT_BIRTH, guardian=None))
    res = client.post("/api/auth/guardian-consent/resend", json={"username": "adulta", "password": "Segura123"})
    assert res.status_code == 409 and res.get_json()["error"] == "NOT_PENDING"


# --- Withdrawing removes the account ---------------------------------------

def test_withdrawing_removes_the_account(client, app, outbox):
    from padel_app.models import GuardianConsent

    client.post("/api/auth/register", json=_body())
    _consent(client, _consent_token(outbox))
    login = _login(client)
    old_token = login.get_json()["accessToken"]
    revoke = _revoke_token(outbox)

    view = client.get(f"/api/auth/guardian-consent/revoke/{revoke}")
    assert view.status_code == 200 and view.get_json()["minor"]["username"] == "rita"
    assert client.post(f"/api/auth/guardian-consent/revoke/{revoke}", json={}).status_code == 400
    uid = _user(app).id
    assert _user(app).guardian_consent_status == "granted"

    res = client.post(f"/api/auth/guardian-consent/revoke/{revoke}", json={"confirm": True})
    assert res.status_code == 200, res.get_json()
    user = _user_by_id(app, uid)
    assert user.guardian_consent_status == "revoked"
    assert user.status == "disabled" and user.name == "Deleted user" and user.email is None
    assert client.get("/api/auth/me", headers={"Authorization": f"Bearer {old_token}"}).status_code == 401
    assert _login(client).status_code == 401
    with app.app_context():
        row = GuardianConsent.query.first()
        assert row.revoked_at is not None and row.guardian_name == "Maria Silva"
    assert client.get(f"/api/auth/guardian-consent/revoke/{revoke}").status_code == 410


def test_declining_before_consent_removes_the_account(client, app, outbox):
    client.post("/api/auth/register", json=_body())
    uid = _user(app).id
    token = _consent_token(outbox)
    assert client.post(f"/api/auth/guardian-consent/{token}/decline", json={}).status_code == 400
    res = client.post(f"/api/auth/guardian-consent/{token}/decline", json={"confirm": True})
    assert res.status_code == 200, res.get_json()
    user = _user_by_id(app, uid)
    assert user.guardian_consent_status == "revoked" and user.status == "disabled"
    assert _login(client).status_code == 401


# --- Coach-created players are unaffected ----------------------------------

def test_coach_created_players_are_unaffected(client, app):
    from werkzeug.security import generate_password_hash
    from padel_app.models import Player, User

    with app.app_context():
        user = User(name="Bruno", username="bruno", password=generate_password_hash("Segura123"), status="active")
        db.session.add(user)
        db.session.flush()
        db.session.add(Player(user_id=user.id))
        db.session.commit()
    res = _login(client, "bruno")
    assert res.status_code == 200
    me = client.get("/api/auth/me", headers={"Authorization": f"Bearer {res.get_json()['accessToken']}"}).get_json()
    assert me["guardianConsent"] is None
