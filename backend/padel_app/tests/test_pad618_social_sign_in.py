"""PAD-618 — auth.social-sign-in: sign up and sign in with Google (web, iOS) or Apple (iOS).

The provider verifiers are the only thing stubbed (`social_auth_service._verify_google` and
`_verify_apple` return claims or raise); everything after them runs for real: the identity
lookup, linking by verified email, the signup ticket, sign-up's own checks and the login answer.
"""
import hashlib

import pytest

from padel_app.services import social_auth_service as social

TERMS = {"X-LevApp-Capabilities": "terms-acceptance"}


@pytest.fixture(autouse=True)
def _setup(app, monkeypatch):
    app.config["JWT_SECRET_KEY"] = "test-jwt-secret"
    app.config["GOOGLE_CLIENT_IDS"] = ["web-client.apps.googleusercontent.com"]
    app.config["APPLE_CLIENT_IDS"] = ["com.padellevelup.app"]
    app.config["AUTH_RATE_LIMIT_ENABLED"] = False


@pytest.fixture
def google(monkeypatch):
    """Next Google token's claims: set `google.claims`; `google.fail` makes it invalid."""

    class G:
        claims = {}
        fail = None

    def verify(token, audiences):
        assert audiences == ["web-client.apps.googleusercontent.com"]
        if G.fail:
            raise social.ProviderTokenInvalid(G.fail)
        return dict(G.claims)

    monkeypatch.setattr(social, "_verify_google", verify)
    return G


@pytest.fixture
def apple(monkeypatch):
    class A:
        claims = {}

    def verify(token, audiences):
        assert audiences == ["com.padellevelup.app"]
        return dict(A.claims)

    monkeypatch.setattr(social, "_verify_apple", verify)
    return A


def gclaims(sub="g-123", email="ana@example.com", verified=True, name="Ana Silva"):
    return {"sub": sub, "email": email, "email_verified": verified, "name": name,
            "iss": "https://accounts.google.com", "aud": "web-client.apps.googleusercontent.com"}


def _make_user(app, username="ana", email="ana@example.com", role="student"):
    from padel_app.models import Coach, Player, User
    from padel_app.sql_db import db

    with app.app_context():
        # A verified account (rule 2b links only those); the takeover test unverifies it.
        import datetime as dt

        u = User(name="Ana Silva", username=username, email=email, password="x", status="active",
                 email_verified_at=dt.datetime(2026, 1, 1))
        db.session.add(u)
        db.session.flush()
        db.session.add(Player(user_id=u.id) if role == "student" else Coach(user_id=u.id, approval_status="approved"))
        db.session.commit()
        return u.id


def _identities(app):
    from padel_app.models import UserIdentity

    with app.app_context():
        return [(i.provider, i.subject, i.user_id) for i in UserIdentity.query.order_by(UserIdentity.id)]


def social_post(client, provider="google", token="tok", nonce=None):
    body = {"provider": provider, "idToken": token}
    if nonce is not None:
        body["nonce"] = nonce
    return client.post("/api/auth/social", json=body)


# ── rule 2a / 2b: known identity, linking ─────────────────────────────────────

def test_a_verified_email_links_an_existing_account_then_the_identity_signs_in(client, app, google):
    uid = _make_user(app)
    google.claims = gclaims()
    res = social_post(client)
    assert res.status_code == 200, res.get_json()
    body = res.get_json()
    assert body["accessToken"] and body["user"]["id"] == uid
    assert _identities(app) == [("google", "g-123", uid)]
    # The account's email changes later; the identity still finds it (rule 2a).
    from padel_app.models import User
    from padel_app.sql_db import db

    with app.app_context():
        User.query.get(uid).email = "other@example.com"
        db.session.commit()
    res = social_post(client)
    assert res.status_code == 200 and res.get_json()["user"]["id"] == uid
    assert len(_identities(app)) == 1


def test_an_unverified_email_never_links(client, app, google):
    _make_user(app)
    google.claims = gclaims(verified=False)
    res = social_post(client)
    assert res.status_code == 401
    assert res.get_json()["error"] == "INVALID_PROVIDER_TOKEN"
    assert _identities(app) == []


def test_email_matching_ignores_case(client, app, google):
    uid = _make_user(app, email="Ana@Example.com")
    google.claims = gclaims(email="ana@example.com")
    assert social_post(client).get_json()["user"]["id"] == uid


def test_a_disabled_account_is_refused_as_login_refuses_it(client, app, google):
    from padel_app.models import User
    from padel_app.sql_db import db

    uid = _make_user(app)
    with app.app_context():
        User.query.get(uid).status = "disabled"
        db.session.commit()
    google.claims = gclaims()
    res = social_post(client)
    assert res.status_code == 401 and res.get_json()["error"] == "ACCOUNT_DISABLED"
    assert _identities(app) == []


# ── rule 2c / 4: new person ───────────────────────────────────────────────────

def _complete(client, ticket, **over):
    body = {"signupTicket": ticket, "role": "student", "birthDate": "1995-03-04", "country": "PT",
            "termsAccepted": True}
    body.update(over)
    return client.post("/api/auth/social/complete", json=body, headers=TERMS)


def test_a_new_person_completes_sign_up_and_gets_a_password_less_account(client, app, google):
    google.claims = gclaims(sub="g-new", email="Rita@Example.com", name="Rita Lopes")
    res = social_post(client)
    assert res.status_code == 200, res.get_json()
    body = res.get_json()
    assert body["needsProfile"] is True
    assert (body["name"], body["email"]) == ("Rita Lopes", "rita@example.com")
    assert _identities(app) == []

    res = _complete(client, body["signupTicket"])
    assert res.status_code == 200, res.get_json()
    login = res.get_json()
    assert login["accessToken"]
    from padel_app.models import Player, User

    with app.app_context():
        u = User.query.get(login["user"]["id"])
        assert (u.email, u.name, u.password, u.country) == ("rita@example.com", "Rita Lopes", None, "PT")
        assert u.email_verified_at is not None and u.terms_accepted_at is not None
        assert u.username.startswith("rita")
        assert Player.query.filter_by(user_id=u.id).count() == 1
    assert _identities(app) == [("google", "g-new", login["user"]["id"])]


@pytest.mark.parametrize(
    "over, field",
    [({"birthDate": "2012-01-01"}, "birthDate"), ({"country": ""}, "country"),
     ({"termsAccepted": False}, "terms"), ({"role": "admin"}, "role")],
)
def test_completion_runs_sign_ups_own_checks(client, app, google, over, field):
    google.claims = gclaims(sub="g-teen", email="teen@example.com")
    ticket = social_post(client).get_json()["signupTicket"]
    res = _complete(client, ticket, **over)
    assert res.status_code == 400, res.get_json()
    assert res.get_json().get("field") == field
    assert _identities(app) == []


def test_a_forged_or_tampered_ticket_is_401(client, app, google):
    google.claims = gclaims(sub="g-x", email="x@example.com")
    ticket = social_post(client).get_json()["signupTicket"]
    assert _complete(client, ticket[:-3] + "AAA").status_code == 401
    assert _complete(client, "not-a-ticket").status_code == 401
    assert _identities(app) == []


def test_a_used_ticket_cannot_create_a_second_account(client, app, google):
    google.claims = gclaims(sub="g-once", email="once@example.com")
    ticket = social_post(client).get_json()["signupTicket"]
    assert _complete(client, ticket).status_code == 200
    res = _complete(client, ticket)
    assert res.status_code == 409


def test_a_coach_who_signs_up_with_google_waits_for_approval(client, app, google, monkeypatch):
    from padel_app.services import app_settings_service, hubspot_sync

    monkeypatch.setattr(app_settings_service, "coach_approval_required", lambda: True)
    synced = []
    monkeypatch.setattr(hubspot_sync, "sync_coach_signup", lambda user, coach: synced.append(user.id))
    google.claims = gclaims(sub="g-coach", email="coach@example.com")
    ticket = social_post(client).get_json()["signupTicket"]
    res = _complete(client, ticket, role="coach")
    assert res.status_code == 200, res.get_json()
    from padel_app.models import Coach

    with app.app_context():
        coach = Coach.query.filter_by(user_id=res.get_json()["user"]["id"]).one()
        assert coach.approval_status == "pending"
    assert synced == [res.get_json()["user"]["id"]]


# ── rule 1: verification and configuration ───────────────────────────────────

def test_an_invalid_token_is_401_and_writes_nothing(client, app, google):
    _make_user(app)
    google.fail = "bad signature"
    res = social_post(client)
    assert res.status_code == 401 and res.get_json()["error"] == "INVALID_PROVIDER_TOKEN"
    assert _identities(app) == []


def test_a_provider_without_client_ids_is_503(client, app, google):
    app.config["GOOGLE_CLIENT_IDS"] = []
    res = social_post(client)
    assert res.status_code == 503 and res.get_json()["error"] == "PROVIDER_NOT_CONFIGURED"


def test_an_unknown_provider_is_400(client, app):
    assert social_post(client, provider="facebook").status_code == 400


def test_apple_checks_the_nonce(client, app, apple):
    uid = _make_user(app)
    raw = "raw-nonce-123"
    apple.claims = {"sub": "a-1", "email": "ana@example.com", "email_verified": "true",
                    "nonce": hashlib.sha256(raw.encode()).hexdigest()}
    assert social_post(client, provider="apple", nonce="wrong").status_code == 401
    res = social_post(client, provider="apple", nonce=raw)
    assert res.status_code == 200, res.get_json()
    assert res.get_json()["user"]["id"] == uid
    assert _identities(app) == [("apple", "a-1", uid)]


def test_account_deletion_removes_the_identities(client, app, google):
    from padel_app.services.account_service import delete_account_service

    uid = _make_user(app)
    google.claims = gclaims()
    assert social_post(client).status_code == 200
    with app.app_context():
        delete_account_service(uid)
    assert _identities(app) == []
    # The same Google account now finds no LevApp account: a new sign-up, not the deleted one.
    assert social_post(client).get_json().get("needsProfile") is True


# ── verifiers (the real ones, with the network stubbed) ─────────────────────────

def test_the_google_verifier_checks_issuer_and_audience(monkeypatch):
    from padel_app.services.admin import google_verifier

    claims = {"iss": "evil.example", "aud": "web", "sub": "1", "email": "a@b.c", "email_verified": True}
    monkeypatch.setattr(google_verifier, "verify", lambda token, client_id, now=None: dict(claims))
    with pytest.raises(social.ProviderTokenInvalid):
        social._real_verify_google("t", ["web"])
    claims["iss"] = "https://accounts.google.com"
    claims["aud"] = "other"
    with pytest.raises(social.ProviderTokenInvalid):
        social._real_verify_google("t", ["web"])
    claims["aud"] = "web"
    assert social._real_verify_google("t", ["web"])["sub"] == "1"


# ── security review round ─────────────────────────────────────────────────────

def _unverify(app, uid):
    from padel_app.models import User
    from padel_app.sql_db import db

    with app.app_context():
        u = User.query.get(uid)
        u.email_verified_at = None
        u.email_verification_required = True
        db.session.commit()


def test_an_account_whose_own_email_is_unverified_is_never_linked(client, app, google):
    """Pre-hijack: someone registers the victim's address by password and never verifies it.
    The victim's Google sign-in must not land in that account."""
    uid = _make_user(app)
    _unverify(app, uid)
    google.claims = gclaims()
    res = social_post(client)
    assert res.status_code == 409, res.get_json()
    assert res.get_json()["error"] == "ACCOUNT_EMAIL_UNVERIFIED"
    assert _identities(app) == []


def test_a_returning_apple_user_without_email_signs_in_by_identity(client, app, apple):
    uid = _make_user(app)
    raw = "n-1"
    nonce = hashlib.sha256(raw.encode()).hexdigest()
    apple.claims = {"sub": "a-9", "email": "ana@example.com", "email_verified": "true", "nonce": nonce}
    assert social_post(client, provider="apple", nonce=raw).status_code == 200
    # Apple sends the email only on the first authorization.
    apple.claims = {"sub": "a-9", "nonce": nonce}
    res = social_post(client, provider="apple", nonce=raw)
    assert res.status_code == 200, res.get_json()
    assert res.get_json()["user"]["id"] == uid


def test_an_unknown_apple_account_without_email_is_refused(client, app, apple):
    raw = "n-2"
    apple.claims = {"sub": "a-new", "nonce": hashlib.sha256(raw.encode()).hexdigest()}
    assert social_post(client, provider="apple", nonce=raw).status_code == 401
    assert _identities(app) == []


def test_two_accounts_sharing_an_email_up_to_case_are_not_linked_at_random(client, app, google):
    first = _make_user(app, username="ana1", email="ana@example.com")
    _make_user(app, username="ana2", email="ANA@example.com")
    google.claims = gclaims()
    res = social_post(client)
    assert res.status_code == 200, res.get_json()
    assert res.get_json()["user"]["id"] == first


def test_a_concurrent_completion_that_loses_the_race_is_a_409(client, app, google, monkeypatch):
    from padel_app.services import registration_service

    google.claims = gclaims(sub="g-race", email="race@example.com")
    ticket = social_post(client).get_json()["signupTicket"]
    # The other request wins between our checks and our insert: the identity already exists.
    real = registration_service._create_account

    def lose_the_race(**kw):
        real(**{**kw, "username": kw["username"] + "x"})
        return real(**kw)

    monkeypatch.setattr(registration_service, "_create_account", lose_the_race)
    res = _complete(client, ticket)
    assert res.status_code == 409, res.get_json()
    assert res.get_json()["error"] == "ALREADY_COMPLETED"


def test_the_new_username_does_not_expose_the_email(client, app, google):
    google.claims = gclaims(sub="g-u", email="secret.address@example.com", name="Rita Lopes")
    ticket = social_post(client).get_json()["signupTicket"]
    uid = _complete(client, ticket).get_json()["user"]["id"]
    from padel_app.models import User

    with app.app_context():
        username = User.query.get(uid).username
    assert "secret" not in username and username.startswith("rita")


def test_apple_tokens_must_carry_the_standard_claims_and_an_outage_is_503(monkeypatch):
    import jwt

    seen = {}

    class FakeKey:
        key = "k"

    class FakeClient:
        def __init__(self, url, **kw):
            seen["kw"] = kw

        def get_signing_key_from_jwt(self, token):
            if token == "down":
                raise jwt.PyJWKClientConnectionError("unreachable")
            return FakeKey()

    def fake_decode(token, key, **kw):
        seen["decode"] = kw
        return {"sub": "a"}

    monkeypatch.setattr(jwt, "PyJWKClient", FakeClient)
    monkeypatch.setattr(jwt, "decode", fake_decode)
    monkeypatch.setattr(social, "_apple_jwks", None)
    social._real_verify_apple("t", ["com.padellevelup.app"])
    assert set(seen["decode"]["options"]["require"]) >= {"exp", "iss", "aud", "sub"}
    assert seen["kw"]["timeout"] == 5
    monkeypatch.setattr(social, "_apple_jwks", None)
    with pytest.raises(social.ProviderUnavailable):
        social._real_verify_apple("down", ["com.padellevelup.app"])
