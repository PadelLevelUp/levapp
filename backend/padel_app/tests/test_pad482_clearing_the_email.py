"""B-262 (PAD-482): settings.profile rule 9 and auth.email-verification rule 2 — an account with no email
is never `verified`.

Clearing the email in Settings used to keep `email_verified_at`, so a coach with no address to reach
read as verified in `/api/auth/me` and in the admin approvals list. Clearing now resets verification:
no timestamp, nothing required, no pending code. What each shape of `email` in a PATCH does:
- `""` or whitespace: clears the email (and, now, the verification);
- `null`: the same as `""` — the service reads `data.get("email") or ""`;
- the key absent: nothing about the email or its verification changes;
- the same address (any case), as an old build's whole-form save sends it: nothing changes.
"""
import pytest

from padel_app.tests.test_email_verification import (  # noqa: F401
    _auth,
    _code_from,
    _jwt_secret,
    _register,
    _user,
    outbox,
)
from padel_app.sql_db import db


def _verified_coach(app, client, outbox):
    _register(client, role="coach", username="rui", email="rui@example.com")
    headers = _auth(app, _user(app, "rui").id)
    res = client.post("/api/auth/email-verification/confirm", json={"code": _code_from(outbox[0])}, headers=headers)
    assert res.status_code == 200
    assert client.get("/api/auth/me", headers=headers).get_json()["emailVerification"] == "verified"
    return headers


def _admin_headers(app):
    from padel_app.models import User

    with app.app_context():
        admin = User(name="Admin", username="admin", password="pw", status="active", is_superadmin=True)
        db.session.add(admin)
        db.session.commit()
        return _auth(app, admin.id)


def _verification_columns(app, username="rui"):
    user = _user(app, username)
    return (user.email, user.email_verified_at, user.email_verification_required,
            user.email_verification_code_hash, user.email_verification_expires_at)


@pytest.mark.parametrize("cleared", ["", "   ", None])
def test_clearing_the_email_of_a_verified_coach_leaves_it_unverified(app, client, outbox, cleared):
    """Criterion "An account with no email is not verified" — /auth/me and the admin list."""
    headers = _verified_coach(app, client, outbox)

    res = client.patch("/api/auth/me", json={"email": cleared}, headers=headers)

    assert res.status_code == 200, res.get_json()
    assert res.get_json()["emailVerification"] == "unverified"
    me = client.get("/api/auth/me", headers=headers).get_json()
    assert (me["email"], me["emailVerification"]) == (None, "unverified")
    assert _verification_columns(app) == (None, None, False, None, None)
    rows = client.get("/api/app/admin/coach-approvals", headers=_admin_headers(app)).get_json()
    assert [(r["username"], r["emailVerified"]) for r in rows] == [("rui", False)]


def test_clearing_the_email_while_a_code_is_pending_drops_the_code(app, client, outbox):
    _register(client, role="coach", username="rui", email="rui@example.com")
    headers = _auth(app, _user(app, "rui").id)
    assert client.get("/api/auth/me", headers=headers).get_json()["emailVerification"] == "pending"

    res = client.patch("/api/auth/me", json={"email": ""}, headers=headers)

    assert res.get_json()["emailVerification"] == "unverified"
    assert _verification_columns(app) == (None, None, False, None, None)
    # The dropped code can no longer confirm anything.
    late = client.post("/api/auth/email-verification/confirm", json={"code": _code_from(outbox[0])}, headers=headers)
    assert late.status_code != 200
    assert client.get("/api/auth/me", headers=headers).get_json()["emailVerification"] == "unverified"


def test_a_patch_without_the_email_key_changes_nothing_about_it(app, client, outbox):
    headers = _verified_coach(app, client, outbox)
    before = _verification_columns(app)

    res = client.patch("/api/auth/me", json={"name": "Rui C."}, headers=headers)

    assert res.status_code == 200 and res.get_json()["emailVerification"] == "verified"
    assert _verification_columns(app) == before


def test_an_old_build_whole_form_save_with_the_same_email_changes_nothing(app, client, outbox):
    """Builds 27/28 save the whole profile form: name, abbreviation, the email as stored, phone."""
    headers = _verified_coach(app, client, outbox)
    before = _verification_columns(app)

    res = client.patch("/api/auth/me", headers=headers, json={
        "name": "Rui Costa", "abbreviation": "RC", "email": "RUI@example.com", "phone": "912345678",
    })

    assert res.status_code == 200 and res.get_json()["emailVerification"] == "verified"
    assert _verification_columns(app) == before
    assert len(outbox) == 1, "no new code was mailed"


def test_adding_an_email_back_starts_verification_again(app, client, outbox):
    headers = _verified_coach(app, client, outbox)
    assert client.patch("/api/auth/me", json={"email": ""}, headers=headers).status_code == 200

    res = client.patch("/api/auth/me", json={"email": "rui@example.com"}, headers=headers)

    assert res.get_json()["emailVerification"] == "pending"
    assert outbox[-1]["recipients"] == ["rui@example.com"]


def test_a_row_left_with_no_email_and_a_timestamp_reads_unverified_everywhere(app, client, outbox):
    """A row cleared before B-262 was fixed still holds `email_verified_at`: the state is derived from
    the email first, so /auth/me and the admin list say unverified without any data change."""
    from padel_app.models import User

    headers = _verified_coach(app, client, outbox)
    with app.app_context():
        user = User.query.filter_by(username="rui").first()
        user.email = None  # as the old PATCH left it: the timestamp stays
        db.session.commit()

    assert client.get("/api/auth/me", headers=headers).get_json()["emailVerification"] == "unverified"
    rows = client.get("/api/app/admin/coach-approvals", headers=_admin_headers(app)).get_json()
    assert [(r["username"], r["emailVerified"]) for r in rows] == [("rui", False)]

