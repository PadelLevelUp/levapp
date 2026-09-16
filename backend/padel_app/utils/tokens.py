"""Access-token minting and the absolute session cap (PAD-269, audit M11).

auth.token-refresh rule 6: every access token carries `auth_time`, the moment
of the login (or sign-up) that started the session. The silent refresh copies
it unchanged, so a session in constant use still ends
`JWT_ABSOLUTE_SESSION_DAYS` (default 90) after its login. A token minted
before this rule has no `auth_time`; its `iat` stands in, and the next refresh
stamps that value.
"""
from datetime import datetime, timezone

from flask import current_app
from flask_jwt_extended import create_access_token


def now_ts():
    return int(datetime.now(timezone.utc).timestamp())


def issue_access_token(user_id, auth_time=None):
    """A new access token for `user_id`; a fresh session unless `auth_time` is given."""
    stamp = int(auth_time) if auth_time is not None else now_ts()
    return create_access_token(identity=str(user_id), additional_claims={"auth_time": stamp})


def session_started_at(jwt_payload):
    return jwt_payload.get("auth_time") or jwt_payload.get("iat")


def session_over(jwt_payload, now=None):
    """True once the session behind this token is older than the cap."""
    started = session_started_at(jwt_payload)
    if not started:
        return False
    cap_days = int(current_app.config.get("JWT_ABSOLUTE_SESSION_DAYS", 90) or 90)
    return (now or now_ts()) - int(started) > cap_days * 86400
