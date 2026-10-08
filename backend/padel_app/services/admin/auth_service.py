"""admin.foundation rules 1–4 (PAD-531): staff sign-in and the admin token.

The admin token is a plain PyJWT token with `aud = levapp-admin`, signed with the app's
JWT_SECRET_KEY, `sub` = the admin_roles id, 12 hours, no refresh. It is decoded here, never by
Flask-JWT-Extended (whose product tokens carry no audience; the product side refuses any `aud`,
B-381).
"""
import uuid
from datetime import datetime, timezone

import jwt
from flask import current_app

from padel_app.config import (
    ADMIN_JWT_AUDIENCE_DEFAULT,
    ADMIN_STAFF_DOMAIN_DEFAULT,
    ADMIN_TOKEN_EXPIRES_DEFAULT,
)
from padel_app.models import TokenBlocklist
from padel_app.models.admin_role import AdminRole
from padel_app.services.admin import google_verifier

_DEFAULTS = {
    "ADMIN_STAFF_DOMAIN": ADMIN_STAFF_DOMAIN_DEFAULT,
    "ADMIN_JWT_AUDIENCE": ADMIN_JWT_AUDIENCE_DEFAULT,
    "ADMIN_TOKEN_EXPIRES": ADMIN_TOKEN_EXPIRES_DEFAULT,
}

GOOGLE_ISSUERS = ("accounts.google.com", "https://accounts.google.com")


class AdminAuthError(Exception):
    status = 400
    code = "ADMIN_AUTH_ERROR"

    def __init__(self, email=None, detail=None):
        super().__init__(detail or self.code)
        self.email = email
        self.detail = detail


class NotConfigured(AdminAuthError):
    status = 503
    code = "ADMIN_NOT_CONFIGURED"


class GoogleTokenInvalidError(AdminAuthError):
    status = 401
    code = "GOOGLE_TOKEN_INVALID"


class NotStaffDomain(AdminAuthError):
    status = 403
    code = "NOT_STAFF_DOMAIN"


class NoAdminRole(AdminAuthError):
    status = 403
    code = "NO_ADMIN_ROLE"


class AdminTokenInvalid(Exception):
    """The bearer token is missing, not an admin token, expired, blocklisted or revoked."""


def _cfg(name):
    value = current_app.config.get(name)
    return _DEFAULTS.get(name) if value is None else value


def staff_domain():
    return _cfg("ADMIN_STAFF_DOMAIN")


def _secret():
    # The same resolution Flask-JWT-Extended uses for the product tokens.
    secret = current_app.config.get("JWT_SECRET_KEY") or current_app.config.get("SECRET_KEY")
    if not secret:
        raise RuntimeError("JWT_SECRET_KEY or SECRET_KEY must be set to sign admin tokens")
    return secret


def is_configured():
    return bool((_cfg("ADMIN_GOOGLE_CLIENT_ID") or "").strip())


def public_config():
    return {
        "googleClientId": (_cfg("ADMIN_GOOGLE_CLIENT_ID") or "").strip(),
        "configured": is_configured(),
        "staffDomain": _cfg("ADMIN_STAFF_DOMAIN"),
    }


def verify_google_credential(credential):
    """Rule 1, the five checks. Returns the lower-cased email of a verified company account."""
    client_id = (_cfg("ADMIN_GOOGLE_CLIENT_ID") or "").strip()
    if not client_id:
        raise NotConfigured()
    if not credential or not isinstance(credential, str):
        raise GoogleTokenInvalidError(detail="missing credential")
    try:
        claims = google_verifier.verify(credential, client_id)  # (a) signature + expiry
    except google_verifier.GoogleTokenInvalid as exc:
        raise GoogleTokenInvalidError(detail=str(exc)) from exc
    if not isinstance(claims, dict):
        raise GoogleTokenInvalidError(detail="no claims")
    email = str(claims.get("email") or "").strip().lower()
    if claims.get("aud") != client_id:  # (b)
        raise GoogleTokenInvalidError(email=email or None, detail="audience mismatch")
    if claims.get("iss") not in GOOGLE_ISSUERS:  # (c)
        raise GoogleTokenInvalidError(email=email or None, detail="issuer is not Google")
    domain = _cfg("ADMIN_STAFF_DOMAIN")
    if claims.get("email_verified") is not True:  # (d)
        raise NotStaffDomain(email=email or None, detail="email not verified")
    if claims.get("hd") != domain or not email.endswith("@" + domain):  # (e)
        raise NotStaffDomain(email=email or None, detail="not the company domain")
    return email


def sign_in(credential):
    """Rules 1–3: verify the credential, require an active role, mint the admin token.

    Returns ``(token, role_row, expires_at)``; raises an AdminAuthError subclass otherwise.
    """
    email = verify_google_credential(credential)
    role = AdminRole.active_by_email(email)
    if role is None or role.revoked_at is not None:  # rule 2: no default role, ever
        raise NoAdminRole(email=email)
    token, expires_at = mint_admin_token(role)
    return token, role, expires_at


def mint_admin_token(role, now=None):
    now = now or datetime.now(timezone.utc)
    expires_at = now + _cfg("ADMIN_TOKEN_EXPIRES")
    claims = {
        "sub": str(role.id),
        "aud": _cfg("ADMIN_JWT_AUDIENCE"),
        "role": role.role,
        "email": role.email,
        "jti": str(uuid.uuid4()),
        "type": "admin",
        "iat": int(now.timestamp()),
        "exp": int(expires_at.timestamp()),
    }
    token = jwt.encode(claims, _secret(), algorithm="HS256")
    return token, expires_at


def decode_admin_token(token):
    """Rule 3: only a token whose audience is the console's is an admin token."""
    try:
        claims = jwt.decode(
            token,
            _secret(),
            algorithms=["HS256"],
            audience=_cfg("ADMIN_JWT_AUDIENCE"),
        )
    except jwt.PyJWTError as exc:
        raise AdminTokenInvalid(str(exc)) from exc
    if claims.get("type") != "admin" or not claims.get("jti"):
        raise AdminTokenInvalid("not an admin token")
    if TokenBlocklist.query.filter_by(jti=claims["jti"]).first() is not None:
        raise AdminTokenInvalid("signed out")
    return claims


def load_role_for_claims(claims):
    """Rule 4: the role is read on every request; a missing or revoked row ends access."""
    try:
        role_id = int(claims.get("sub"))
    except (TypeError, ValueError):
        raise AdminTokenInvalid("bad subject")
    role = AdminRole.query.get(role_id)
    if role is None or role.revoked_at is not None:
        raise AdminTokenInvalid("role revoked")
    # Hardening: a token older than the role's latest grant or change is dead, so re-granting a
    # revoked email (which re-activates the same row) never revives a token issued before it.
    # `iat` is whole seconds; the grant time is floored to match (naive UTC, R-023).
    granted = int(role.granted_at.replace(tzinfo=timezone.utc).timestamp()) if role.granted_at else 0
    if int(claims.get("iat") or 0) < granted:
        raise AdminTokenInvalid("issued before the latest grant")
    return role


def sign_out(claims):
    """Rule 4: the token's jti joins token_blocklist (committed by @audited)."""
    from padel_app.sql_db import db

    if TokenBlocklist.query.filter_by(jti=claims["jti"]).first() is None:
        db.session.add(TokenBlocklist(jti=claims["jti"]))
