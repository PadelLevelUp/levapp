"""PAD-531 admin.foundation rules 1, 2, 13: staff sign-in with Google.

The verifier is stubbed at `padel_app.services.admin.google_verifier.verify`; the five checks
(signature via the verifier; aud; iss; email_verified; hd + email suffix) run in the service.
"""
import jwt
import pytest

from padel_app.services.admin.google_verifier import GoogleTokenInvalid
from padel_app.tests.admin_helpers import CLIENT_ID, audit_rows, google_claims, make_role, signing, stub_verifier

URL = "/admin/api/auth/google"


def _post(client, credential="cred"):
    signing(client.application)
    return client.post(URL, json={"credential": credential})


def test_a_company_account_with_a_role_signs_in(app, client, monkeypatch):
    make_role(app, "ana@levapp.app", "operator")
    stub_verifier(monkeypatch, google_claims("ana@levapp.app"))
    r = _post(client)
    assert r.status_code == 200, r.get_json()
    body = r.get_json()
    claims = jwt.decode(body["token"], app.config["JWT_SECRET_KEY"], algorithms=["HS256"], audience="levapp-admin")
    assert claims["aud"] == "levapp-admin"
    assert claims["role"] == "operator"
    assert claims["email"] == "ana@levapp.app"
    assert 12 * 3600 - 5 <= claims["exp"] - claims["iat"] <= 12 * 3600
    assert body["role"] == "operator" and body["email"] == "ana@levapp.app"
    rows = audit_rows(app, "auth.sign_in")
    assert len(rows) == 1 and rows[0]["outcome"] == "ok" and rows[0]["actorEmail"] == "ana@levapp.app"


def test_a_personal_google_account_is_refused(app, client, monkeypatch):
    stub_verifier(monkeypatch, google_claims("ana@gmail.com", hd=None))
    r = _post(client)
    assert r.status_code == 403 and r.get_json() == {"error": "NOT_STAFF_DOMAIN"}
    rows = audit_rows(app, "auth.sign_in")
    assert len(rows) == 1 and rows[0]["outcome"] == "denied" and rows[0]["actorEmail"] == "ana@gmail.com"


@pytest.mark.parametrize(
    "claims",
    [
        google_claims("ana@levapp.app", hd="other.com"),
        google_claims("ana@levapp.app.evil.com", hd="levapp.app"),
    ],
    ids=["hd-other", "suffix-spoof"],
)
def test_a_spoofed_domain_is_refused(app, client, monkeypatch, claims):
    make_role(app, "ana@levapp.app", "operator")
    stub_verifier(monkeypatch, claims)
    r = _post(client)
    assert r.status_code == 403 and r.get_json() == {"error": "NOT_STAFF_DOMAIN"}
    assert "token" not in (r.get_json() or {})


@pytest.mark.parametrize(
    "setup",
    [
        {"exc": GoogleTokenInvalid("bad signature")},
        {"claims": google_claims("ana@levapp.app", aud="other-client")},
        {"claims": google_claims("ana@levapp.app", iss="https://evil.example")},
    ],
    ids=["signature", "audience", "issuer"],
)
def test_a_token_that_does_not_verify_is_refused(app, client, monkeypatch, setup):
    make_role(app, "ana@levapp.app", "operator")
    stub_verifier(monkeypatch, setup.get("claims"), setup.get("exc"))
    r = _post(client)
    assert r.status_code == 401 and r.get_json() == {"error": "GOOGLE_TOKEN_INVALID"}
    rows = audit_rows(app, "auth.sign_in")
    assert len(rows) == 1 and rows[0]["outcome"] == "denied"


def test_an_unverified_email_is_refused(app, client, monkeypatch):
    make_role(app, "ana@levapp.app", "operator")
    stub_verifier(monkeypatch, google_claims("ana@levapp.app", email_verified=False))
    r = _post(client)
    assert r.status_code == 403 and r.get_json() == {"error": "NOT_STAFF_DOMAIN"}


def test_a_domain_account_without_a_role_is_refused(app, client, monkeypatch):
    stub_verifier(monkeypatch, google_claims("rui@levapp.app"))
    r = _post(client)
    assert r.status_code == 403 and r.get_json() == {"error": "NO_ADMIN_ROLE"}
    rows = audit_rows(app, "auth.sign_in")
    assert len(rows) == 1 and rows[0]["outcome"] == "denied" and rows[0]["actorEmail"] == "rui@levapp.app"


def test_a_revoked_role_does_not_sign_in(app, client, monkeypatch):
    make_role(app, "rui@levapp.app", "owner", revoked=True)
    stub_verifier(monkeypatch, google_claims("rui@levapp.app"))
    assert _post(client).status_code == 403


def test_the_verifier_is_called_with_the_configured_client_id(app, client, monkeypatch):
    make_role(app, "ana@levapp.app")
    calls = stub_verifier(monkeypatch, google_claims("ana@levapp.app"))
    _post(client, "the-credential")
    assert calls == [("the-credential", CLIENT_ID)]


def test_sign_in_degrades_when_the_client_id_is_empty(app_with_config, monkeypatch):
    app = signing(app_with_config({"ADMIN_GOOGLE_CLIENT_ID": ""}))
    calls = stub_verifier(monkeypatch, google_claims("ana@levapp.app"))
    client = app.test_client()
    cfg = client.get("/admin/api/auth/config")
    assert cfg.status_code == 200
    assert cfg.get_json() == {"googleClientId": "", "configured": False, "staffDomain": "levapp.app"}
    r = client.post(URL, json={"credential": "cred"})
    assert r.status_code == 503 and r.get_json() == {"error": "ADMIN_NOT_CONFIGURED"}
    assert calls == []


def test_auth_config_exposes_the_public_client_id(client):
    assert client.get("/admin/api/auth/config").get_json() == {
        "googleClientId": CLIENT_ID, "configured": True, "staffDomain": "levapp.app",
    }
