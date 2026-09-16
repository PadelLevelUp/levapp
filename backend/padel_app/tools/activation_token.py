"""The per-account secret in an activation link (auth.activate rule 2, PAD-254).

`/register/<userId>?t=<token>` — before B-034 the numeric id WAS the link, so
anyone could complete (and take over) any inactive account by counting. The
token is derived, not stored: HMAC-SHA256 of ``activate:<id>:<created_at>``
under the app's ``SECRET_KEY``. That needs no column, is unguessable without
the server secret, and only changes if the secret rotates. Activation itself
closes the link (rule 6), so it needs neither expiry nor a used flag.

This module is the only place that builds or checks the token.
"""
import hashlib
import hmac

from flask import current_app


def activation_token_for(user) -> str:
    """Hex HMAC (64 chars) that must accompany ``user``'s activation link."""
    created = user.created_at.isoformat() if getattr(user, "created_at", None) else ""
    secret = str(current_app.config.get("SECRET_KEY") or "").encode("utf-8")
    message = f"activate:{user.id}:{created}".encode("utf-8")
    return hmac.new(secret, message, hashlib.sha256).hexdigest()


def activation_token_matches(user, token) -> bool:
    """Constant-time check; a missing or non-string token never matches."""
    if not isinstance(token, str) or not token:
        return False
    return hmac.compare_digest(activation_token_for(user), token)
