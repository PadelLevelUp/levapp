"""PAD-531 hardening (coordinator review of #560/#561, 2026-10-07), before the console deploys:

1. `POST /admin/api/auth/google` is rate-limited per IP, and Google's signing certificates are
   cached instead of fetched on every sign-in;
2. the last-owner check locks the owner rows (Postgres `FOR UPDATE`), so two concurrent revokes
   cannot both pass it;
3. a token issued before the role's latest grant, change or revoke is refused, so re-granting a
   revoked email does not revive its old tokens;
4. the migration seeds only staff-domain emails as owners;
5. the admin token's audience check is tested on its own;
6. the console image sends security headers (CSP allowing Google Identity Services, frame-ancestors
   'none', Referrer-Policy, nosniff, HSTS) on every location.
"""
import importlib.util
import pathlib
import re
import time
from datetime import datetime, timedelta, timezone

import jwt
import pytest
import sqlalchemy as sa
from alembic.migration import MigrationContext
from alembic.operations import Operations

from padel_app.sql_db import db
from padel_app.tests.admin_helpers import admin_token, bearer, google_claims, make_role, signing, stub_verifier

ROOT = pathlib.Path(__file__).resolve().parents[3]


# 1 ─ rate limit and certificate cache


def test_google_sign_in_is_rate_limited_per_ip(app, client, monkeypatch):
    signing(app)
    app.config["AUTH_RATE_LIMIT_ENABLED"] = True
    app.config["AUTH_RATE_LIMIT_ADMIN_SIGN_IN"] = "3/60"
    stub_verifier(monkeypatch, google_claims("rui@levapp.app"))  # no role: 403 each time
    codes = [client.post("/admin/api/auth/google", json={"credential": "c"}).status_code for _ in range(4)]
    assert codes == [403, 403, 403, 429]


def test_the_production_default_limits_sign_in():
    from padel_app.config import Config

    assert Config.AUTH_RATE_LIMIT_ADMIN_SIGN_IN == "10/60"


def test_google_certificates_are_fetched_once_while_fresh(monkeypatch):
    from padel_app.services.admin import google_verifier

    calls = []

    class Resp:
        status_code = 200
        headers = {"Cache-Control": "public, max-age=3600"}

        def json(self):
            return {"kid1": "-----BEGIN CERTIFICATE-----x"}

    monkeypatch.setattr(google_verifier, "_http_get", lambda url, timeout: calls.append(url) or Resp())
    google_verifier._CERTS.clear()
    now = time.time()
    assert google_verifier.google_certs(now=now) == {"kid1": "-----BEGIN CERTIFICATE-----x"}
    google_verifier.google_certs(now=now + 3500)
    assert len(calls) == 1
    google_verifier.google_certs(now=now + 3601)
    assert len(calls) == 2


def test_the_verifier_checks_against_the_cached_certificates(monkeypatch):
    from padel_app.services.admin import google_verifier

    seen = {}

    def fake_decode(token, certs, audience, clock_skew_in_seconds=0):
        seen.update(token=token, certs=certs, audience=audience)
        return {"email": "a@levapp.app"}

    monkeypatch.setattr(google_verifier, "google_certs", lambda now=None: {"k": "cert"})
    monkeypatch.setattr(google_verifier, "_jwt_decode", fake_decode)
    assert google_verifier.verify("tok", "client") == {"email": "a@levapp.app"}
    assert seen == {"token": "tok", "certs": {"k": "cert"}, "audience": "client"}

    def boom(*a, **k):
        raise ValueError("bad signature")

    monkeypatch.setattr(google_verifier, "_jwt_decode", boom)
    with pytest.raises(google_verifier.GoogleTokenInvalid):
        google_verifier.verify("tok", "client")


# 2 ─ the last-owner check locks


def test_the_last_owner_check_locks_the_owner_rows(app, monkeypatch):
    from padel_app.services.admin import role_service

    locked = []
    real = role_service._owner_rows_for_update

    def spy():
        rows = real()
        locked.append(len(rows))
        return rows

    monkeypatch.setattr(role_service, "_owner_rows_for_update", spy)
    owner = make_role(app, "boss@levapp.app", "owner")
    from flask import g

    with app.test_request_context():
        g.audit = None
        with pytest.raises(role_service.LastOwner):
            role_service.revoke(owner, "boss@levapp.app")
    assert locked == [1]
    src = (ROOT / "backend/padel_app/services/admin/role_service.py").read_text()
    assert "with_for_update()" in src


# 3 ─ old tokens die with a new grant


def test_a_token_issued_before_a_regrant_is_refused(app, client):
    owner = make_role(app, "boss@levapp.app", "owner")
    rui = make_role(app, "rui@levapp.app", "operator")
    old = admin_token(app, rui)
    assert client.get("/admin/api/auth/me", headers=bearer(old)).status_code == 200
    boss = bearer(admin_token(app, owner))
    assert client.delete(f"/admin/api/roles/{rui}", headers=boss).status_code == 200
    time.sleep(1.1)  # token iat is whole seconds; the grant must be strictly later
    assert client.post("/admin/api/roles", headers=boss, json={"email": "rui@levapp.app", "role": "support"}).status_code == 201
    assert client.get("/admin/api/auth/me", headers=bearer(old)).status_code == 401
    fresh = admin_token(app, rui)
    assert client.get("/admin/api/auth/me", headers=bearer(fresh)).status_code == 200


def test_a_role_change_ends_the_old_token(app, client):
    owner = make_role(app, "boss@levapp.app", "owner")
    rui = make_role(app, "rui@levapp.app", "operator")
    old = admin_token(app, rui)
    time.sleep(1.1)
    client.post(f"/admin/api/roles/{rui}", headers=bearer(admin_token(app, owner)), json={"role": "support"})
    assert client.get("/admin/api/auth/me", headers=bearer(old)).status_code == 401


# 4 ─ the seed is staff-domain only


def test_the_migration_seeds_only_staff_domain_owners():
    versions = ROOT / "backend/migrations/versions"
    (path,) = versions.glob("*pad531_admin_roles_and_audit_log*.py")
    spec = importlib.util.spec_from_file_location("pad531_mig_h", path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    conn = sa.create_engine("sqlite://").connect()
    conn.exec_driver_sql("CREATE TABLE users (id INTEGER PRIMARY KEY, email VARCHAR(120), is_superadmin BOOLEAN NOT NULL DEFAULT 0)")
    conn.exec_driver_sql("INSERT INTO users (id, email, is_superadmin) VALUES (1, 'Boss@LevApp.app', 1), (2, 'old@gmail.com', 1), (3, 'x@levapp.app.evil.com', 1)")
    with Operations.context(MigrationContext.configure(conn)):
        mod.upgrade()
    emails = [r[0] for r in conn.exec_driver_sql("SELECT email FROM admin_roles ORDER BY email")]
    assert emails == ["admin@levapp.app", "boss@levapp.app"]


# 5 ─ the audience check, alone


def test_a_token_with_another_audience_is_not_an_admin_token(app):
    from padel_app.services.admin.auth_service import AdminTokenInvalid, decode_admin_token

    signing(app)
    now = datetime.now(timezone.utc)
    claims = {"sub": "1", "role": "owner", "email": "a@levapp.app", "jti": "j", "type": "admin",
              "iat": int(now.timestamp()), "exp": int((now + timedelta(hours=1)).timestamp())}
    with app.app_context():
        secret = app.config["JWT_SECRET_KEY"]
        for aud in ("levapp-product", None):
            body = dict(claims) if aud is None else dict(claims, aud=aud)
            with pytest.raises(AdminTokenInvalid):
                decode_admin_token(jwt.encode(body, secret, algorithm="HS256"))
        assert decode_admin_token(jwt.encode(dict(claims, aud="levapp-admin"), secret, algorithm="HS256"))["sub"] == "1"


# 6 ─ security headers on the console image

REQUIRED_HEADERS = {
    "Content-Security-Policy": [
        "default-src 'self'",
        "script-src 'self' https://accounts.google.com/gsi/client",
        "frame-src https://accounts.google.com/gsi/",
        "connect-src 'self' https://accounts.google.com/gsi/",
        "frame-ancestors 'none'",
        "object-src 'none'",
    ],
    "Referrer-Policy": ["no-referrer"],
    "X-Content-Type-Options": ["nosniff"],
    "Strict-Transport-Security": ["max-age="],
}


def test_the_console_sends_its_security_headers_on_every_location():
    admin = ROOT / "frontend/apps/admin"
    snippet = (admin / "security-headers.conf").read_text()
    for header, parts in REQUIRED_HEADERS.items():
        line = next((l for l in snippet.splitlines() if l.strip().startswith(f"add_header {header} ")), None)
        assert line is not None and line.rstrip().endswith("always;"), header
        for part in parts:
            assert part in line, (header, part)
    conf = (admin / "nginx.conf").read_text()
    # nginx drops server-level add_header in any location that has its own, so every location includes them.
    locations = re.findall(r"location [^{]+\{(.*?)\n  \}", conf, re.S)
    assert locations
    for body in locations:
        assert "include /etc/nginx/snippets/security-headers.conf;" in body, body[:80]
    dockerfile = (ROOT / "frontend/Dockerfile.admin").read_text()
    assert "apps/admin/security-headers.conf /etc/nginx/snippets/security-headers.conf" in dockerfile
    assert "FROM node:22-alpine" in dockerfile
