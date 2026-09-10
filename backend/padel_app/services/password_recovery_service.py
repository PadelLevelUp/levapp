"""auth.password-recovery (PAD-139).

A person who forgot their password (or their username) types the email on
the account. One mail carries the username and a 6-digit code; the code plus
a new password signs them in. The code follows the email-verification model:
CSPRNG, stored only as an HMAC keyed by SECRET_KEY, 15 minutes, dead on the
5th wrong attempt, replaced by every new request, and single-use.

`request_recovery` never says whether the email has an account — it answers
the same body either way. `confirm_recovery` answers 410 for an unknown email
exactly as it does for an expired code.

Every function takes `now=` so tests never mock the clock (R-008).
"""
import hmac
import re
import secrets
from datetime import timedelta
from hashlib import sha256

from flask import current_app
from flask_jwt_extended import create_access_token
from werkzeug.security import generate_password_hash

from padel_app.models import User
from padel_app.services.registration_service import EMAIL_RE, PASSWORD_MIN_LENGTH
from padel_app.sql_db import db
from padel_app.utils.dates import utcnow_naive

CODE_LENGTH = 6
CODE_TTL = timedelta(minutes=15)
RESEND_COOLDOWN = timedelta(seconds=60)
MAX_ATTEMPTS = 5

_CODE_RE = re.compile(r"^\d{6}$")


class PasswordRecoveryError(Exception):
    """A rejected request/confirm. `code` is the machine-readable `error`."""

    def __init__(self, code, status, **extra):
        super().__init__(code)
        self.code = code
        self.status = status
        self.extra = extra

    def payload(self):
        return {"error": self.code, **self.extra}


def standard_body():
    """Rule 2: the one body `request` ever answers with."""
    return {
        "ok": True,
        "expiresInSeconds": int(CODE_TTL.total_seconds()),
        "resendAvailableInSeconds": int(RESEND_COOLDOWN.total_seconds()),
    }


def _clean_email(value):
    return (value or "").strip().lower() if isinstance(value, str) else ""


def _hash(code):
    key = (current_app.config.get("SECRET_KEY") or "dev-secret-key").encode()
    return hmac.new(key, code.encode(), sha256).hexdigest()


def _generate_code():
    return f"{secrets.randbelow(10 ** CODE_LENGTH):0{CODE_LENGTH}d}"


def _clear(user):
    user.password_reset_code_hash = None
    user.password_reset_expires_at = None
    user.password_reset_sent_at = None
    user.password_reset_attempts = 0


def _find(email):
    """The recoverable user for `email`, or None (rule 5)."""
    if not email:
        return None
    user = User.query.filter(db.func.lower(User.email) == email).first()
    if user is None or not user.password or user.status == "disabled":
        return None
    return user


def _deliver(user, code):
    from padel_app.tools.email_templates import render_password_recovery_email
    from padel_app.tools.email_tools import send_email

    subject, text, html = render_password_recovery_email(user, code)
    send_email(subject, [user.email], body=text, html=html)


def request_recovery(email, now=None):
    """Rules 2-5. Commits. Always returns `standard_body()` unless the email
    is not even an email (400 INVALID_EMAIL)."""
    now = now or utcnow_naive()
    email = _clean_email(email)
    if not EMAIL_RE.match(email):
        raise PasswordRecoveryError("INVALID_EMAIL", 400)

    user = _find(email)
    if user is None:
        return standard_body()

    sent_at = user.password_reset_sent_at
    if sent_at is not None and now - sent_at < RESEND_COOLDOWN:
        # Rule 4: nothing issued, nothing sent, same answer.
        return standard_body()

    code = _generate_code()
    user.password_reset_code_hash = _hash(code)
    user.password_reset_expires_at = now + CODE_TTL
    user.password_reset_sent_at = now
    user.password_reset_attempts = 0
    try:
        _deliver(user, code)
    except Exception as exc:  # noqa: BLE001 — rule 3: log, clear, still 200
        current_app.logger.warning("recovery mail to %s failed: %s", user.email, exc)
        _clear(user)
    db.session.commit()
    return standard_body()


def login_body(user):
    """The `POST /api/auth/login` response shape (rule 6)."""
    return {
        "accessToken": create_access_token(identity=str(user.id)),
        "user": {"id": user.id, "name": user.name, "role": user.role},
    }


def confirm_recovery(email, code, new_password, now=None):
    """Rule 6. Commits on success and on a consumed attempt. Returns the
    login body."""
    now = now or utcnow_naive()
    email = _clean_email(email)
    raw = (code or "").strip() if isinstance(code, str) else ""
    password = new_password if isinstance(new_password, str) else ""

    user = _find(email)
    attempts_left = (
        max(MAX_ATTEMPTS - (user.password_reset_attempts or 0), 0) if user else 0
    )

    if len(password) < PASSWORD_MIN_LENGTH:
        raise PasswordRecoveryError("WEAK_PASSWORD", 400)
    if not _CODE_RE.match(raw):
        # Malformed input never consumes an attempt.
        raise PasswordRecoveryError("INVALID_CODE", 400, attemptsLeft=attempts_left)

    expired = (
        user is None
        or user.password_reset_code_hash is None
        or user.password_reset_expires_at is None
        or now > user.password_reset_expires_at
        or attempts_left <= 0
    )
    if expired:
        raise PasswordRecoveryError("CODE_EXPIRED", 410)

    if hmac.compare_digest(user.password_reset_code_hash, _hash(raw)):
        user.password = generate_password_hash(password)
        _clear(user)
        if user.email_verified_at is None:
            # The person just proved they own the address.
            user.email_verified_at = now
            user.email_verification_required = False
        db.session.commit()
        return login_body(user)

    user.password_reset_attempts = (user.password_reset_attempts or 0) + 1
    attempts_left = MAX_ATTEMPTS - user.password_reset_attempts
    if attempts_left <= 0:
        # The 5th wrong attempt kills the code: the right one is 410 from now on.
        user.password_reset_code_hash = None
        user.password_reset_expires_at = None
    db.session.commit()
    raise PasswordRecoveryError("INVALID_CODE", 400, attemptsLeft=max(attempts_left, 0))
