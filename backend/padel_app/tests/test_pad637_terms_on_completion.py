"""PAD-637 (PAD-602 D4) — the Terms are recorded on every form that completes an account:
auth.register rule 19b, clubs.coach-invitation rule 8b, players.invite-completion rule 10b,
auth.activate rule 13b; and auth.legal-catch-up (the next-login screen's endpoint).

A client declaring `terms-on-completion` must send `termsAccepted: true` (400 TERMS_REQUIRED, nothing
written); one that does not (App Store builds up to 1.3.x) completes as before with the three columns
NULL. Current builds declare `terms-acceptance` on every request, so it does not gate these forms.

    pytest padel_app/tests/test_pad637_terms_on_completion.py -v
"""
from datetime import date

import pytest

from padel_app.tests.test_pad604_country_on_completion import (
    ADULT, _accept_coach, _accept_player, _activate, _player_invite,
)
from padel_app.tests.test_pad254_activation_token import _inactive_user
from padel_app.tests.test_player_invitation import _auth_header

DECLARING = {"X-LevApp-Capabilities": "open-spots, coach-invite-email, terms-acceptance, "
                                       "country-on-completion, terms-on-completion"}
CURRENT_BUILD = {"X-LevApp-Capabilities": "open-spots, coach-invite-email, terms-acceptance, country-on-completion"}


@pytest.fixture(autouse=True)
def _jwt_secret(app):
    app.config["JWT_SECRET_KEY"] = "test-jwt-secret"


def _terms(app, username=None, user_id=None):
    from padel_app.models import User
    from padel_app.services.registration_service import PRIVACY_VERSION, TERMS_VERSION

    with app.app_context():
        u = User.query.get(user_id) if user_id else User.query.filter_by(username=username).first()
        if u is None:
            return None
        recorded = (u.terms_accepted_at is not None, u.terms_version, u.privacy_version)
        return {"status": u.status, "recorded": recorded,
                "current": recorded == (True, TERMS_VERSION, PRIVACY_VERSION)}


def _terms_refusal(res):
    assert res.status_code == 400, res.get_json()
    body = res.get_json()
    assert (body["field"], body["code"]) == ("terms", "TERMS_REQUIRED"), body


# ── coach invite (clubs.coach-invitation rule 8b) ─────────────────────────────────

def test_coach_invite_records_the_terms(client, app):
    res = _accept_coach(client, app, DECLARING, "c637", country="PT", termsAccepted=True)
    assert res.status_code == 200, res.get_json()
    assert _terms(app, "c637")["current"]


def test_coach_invite_without_the_terms_creates_no_account(client, app):
    _terms_refusal(_accept_coach(client, app, DECLARING, "c637b", country="PT"))
    assert _terms(app, "c637b") is None


def test_coach_invite_from_a_current_store_build_completes_without_a_record(client, app):
    res = _accept_coach(client, app, CURRENT_BUILD, "c637c", country="PT")
    assert res.status_code == 200, res.get_json()
    assert _terms(app, "c637c")["recorded"] == (False, None, None)


# ── player invite (players.invite-completion rule 10b) ────────────────────────────

def test_player_invite_records_the_terms(client, app):
    token = _player_invite(client, app)
    res = _accept_player(client, token, DECLARING, "p637", country="PT", termsAccepted=True)
    assert res.status_code == 200, res.get_json()
    assert _terms(app, "p637")["current"]


def test_player_invite_without_the_terms_stays_pending(client, app):
    token = _player_invite(client, app)
    _terms_refusal(_accept_player(client, token, DECLARING, "p637b", country="PT", termsAccepted=False))
    assert _terms(app, "p637b") is None  # no username was written


def test_player_invite_from_a_current_store_build_completes_without_a_record(client, app):
    token = _player_invite(client, app)
    res = _accept_player(client, token, CURRENT_BUILD, "p637c", country="PT")
    assert res.status_code == 200, res.get_json()
    assert _terms(app, "p637c")["recorded"] == (False, None, None)


# ── activation (auth.activate rule 13b) ───────────────────────────────────────────

def test_activation_records_the_terms(client, app):
    uid = _inactive_user(app)
    res = _activate(client, app, uid, DECLARING, country="PT", termsAccepted=True)
    assert res.status_code == 200, res.get_json()
    assert _terms(app, user_id=uid)["current"]


def test_activation_without_the_terms_keeps_the_account_inactive(client, app):
    uid = _inactive_user(app)
    _terms_refusal(_activate(client, app, uid, DECLARING, country="PT"))
    assert _terms(app, user_id=uid) == {"status": "inactive", "recorded": (False, None, None), "current": False}


def test_activation_from_a_current_store_build_completes_without_a_record(client, app):
    uid = _inactive_user(app)
    res = _activate(client, app, uid, CURRENT_BUILD, country="PT")
    assert res.status_code == 200, res.get_json()
    assert _terms(app, user_id=uid)["recorded"] == (False, None, None)


def test_the_terms_are_checked_after_the_country(client, app):
    """Rule 8b/10b/13b: the country refusal comes first, as the forms show the fields in that order."""
    uid = _inactive_user(app)
    res = _activate(client, app, uid, DECLARING)
    assert (res.status_code, res.get_json()["field"]) == (400, "country")


# ── the next-login catch-up (auth.legal-catch-up) ────────────────────────────────

def _legacy_user(app, *, birth_date=None, terms=False):
    """An active account completed before the record existed (no Terms, maybe no DOB)."""
    from padel_app.models import User
    from padel_app.sql_db import db
    from padel_app.services.registration_service import record_terms_acceptance
    from padel_app.utils.dates import utcnow_naive
    from werkzeug.security import generate_password_hash

    with app.app_context():
        u = User(name="Old", username=f"old{User.query.count()}", password=generate_password_hash("Secret123!"),
                 status="active", birth_date=birth_date)
        db.session.add(u)
        db.session.flush()
        if terms:
            record_terms_acceptance(u, utcnow_naive())
        db.session.commit()
        return u.id


def _me(client, app, uid):
    res = client.get("/api/auth/me", headers=_auth_header(app, uid))
    assert res.status_code == 200, res.get_json()
    return res.get_json()


def _catch_up(client, app, uid, body):
    return client.post("/api/auth/me/legal", json=body, headers=_auth_header(app, uid))


def test_me_says_what_is_pending(client, app):
    both = _legacy_user(app)
    neither = _legacy_user(app, birth_date=date(1990, 1, 1), terms=True)
    assert _me(client, app, both)["legalPending"] == {"terms": True, "birthDate": True}
    assert _me(client, app, neither)["legalPending"] == {"terms": False, "birthDate": False}


def test_saving_records_only_what_was_pending(client, app):
    uid = _legacy_user(app, birth_date=date(1990, 1, 1))
    res = _catch_up(client, app, uid, {"termsAccepted": True, "birthDate": "2001-01-01"})
    assert res.status_code == 200, res.get_json()
    assert res.get_json()["legalPending"] == {"terms": False, "birthDate": False}
    assert _terms(app, user_id=uid)["current"]
    assert _me(client, app, uid)["birthDate"] == "1990-01-01"  # never overwritten


def test_a_missing_part_is_refused_and_nothing_is_written(client, app):
    uid = _legacy_user(app)
    res = _catch_up(client, app, uid, {"termsAccepted": True})
    assert res.status_code == 400 and res.get_json()["code"] == "BIRTH_DATE_REQUIRED", res.get_json()
    assert _terms(app, user_id=uid)["recorded"] == (False, None, None)


def test_unticked_terms_are_refused(client, app):
    uid = _legacy_user(app, birth_date=date(1990, 1, 1))
    res = _catch_up(client, app, uid, {"termsAccepted": False})
    _terms_refusal(res)


def test_under_18_is_refused_and_nothing_is_written(client, app):
    uid = _legacy_user(app)
    seventeen = date.today().replace(year=date.today().year - 17).isoformat()
    res = _catch_up(client, app, uid, {"termsAccepted": True, "birthDate": seventeen})
    assert res.status_code == 400 and res.get_json()["code"] == "UNDERAGE", res.get_json()
    me = _me(client, app, uid)
    assert me["legalPending"] == {"terms": True, "birthDate": True}


def test_the_catch_up_needs_a_session(client):
    assert client.post("/api/auth/me/legal", json={"termsAccepted": True}).status_code == 401
