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
from padel_app.utils.tokens import issue_access_token
from werkzeug.security import generate_password_hash

from padel_app.models import User
from padel_app.services.registration_service import EMAIL_RE, PASSWORD_MIN_LENGTH
from padel_app.sql_db import db
from padel_app.utils.dates import utcnow_naive
from padel_app.utils.emails import normalise_email

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
    return normalise_email(value) or ""


def _hash(code, address):
    """PAD-498 (rule 11): the code is bound to the address it was mailed to — the address is part of
    the HMAC input, so the code confirms only while the account still has that address, whatever order
    an email change and the code's own commit land in."""
    key = (current_app.config.get("SECRET_KEY") or "dev-secret-key").encode()
    bound = f"{(address or '').strip().lower()}\n{code}"
    return hmac.new(key, bound.encode(), sha256).hexdigest()


def _generate_code():
    return f"{secrets.randbelow(10 ** CODE_LENGTH):0{CODE_LENGTH}d}"


def _clear(user):
    user.password_reset_code_hash = None
    user.password_reset_expires_at = None
    user.password_reset_sent_at = None
    user.password_reset_attempts = 0


def _lookup(email):
    """`(user, None)` for the recoverable user for `email`, else `(None, reason)` (rule 5a)."""
    user = User.query.filter(db.func.lower(User.email) == email).first() if email else None
    if user is None:
        return None, "no_user"
    if not user.password:
        return None, "no_password"
    if user.status == "disabled":
        return None, "disabled"
    return user, None


def _find(email):
    """The recoverable user for `email`, or None (rule 5)."""
    return _lookup(email)[0]


def _sent_nothing(reason):
    # Rule 5a (PAD-781): the reason class only, never the address (B-254).
    current_app.logger.info("recovery request sent nothing: %s", reason)
    return standard_body()


def _deliver(user, code):
    """Rule 3 (PAD-734): called after the commit; the mail goes out off the request thread. A mail
    that fails clears this code again, in its own commit, unless a newer code has replaced it. The
    attempt's time stays (PAD-781), so the failure is still readable once the code is gone."""
    from padel_app.tools.email_templates import render_password_recovery_email
    from padel_app.tools.mail_dispatch import send_later

    subject, text, html = render_password_recovery_email(user, code)
    user_id, code_hash = user.id, user.password_reset_code_hash

    def clear():
        fresh = db.session.get(User, user_id, populate_existing=True)  # the row as committed now
        if fresh is not None and fresh.password_reset_code_hash == code_hash:
            attempted_at = fresh.password_reset_sent_at
            _clear(fresh)
            fresh.password_reset_sent_at = attempted_at
            db.session.commit()

    # B-254: the label names the user id, never the address.
    send_later(subject, [user.email], body=text, html=html,
               label=f"recovery mail to user {user_id}", on_failure=clear)


def request_recovery(email, now=None):
    """Rules 2-5. Commits. Always returns `standard_body()` unless the email
    is not even an email (400 INVALID_EMAIL)."""
    now = now or utcnow_naive()
    email = _clean_email(email)
    if not EMAIL_RE.match(email):
        raise PasswordRecoveryError("INVALID_EMAIL", 400)

    user, reason = _lookup(email)
    if user is None:
        return _sent_nothing(reason)

    sent_at = user.password_reset_sent_at
    if sent_at is not None and now - sent_at < RESEND_COOLDOWN:
        # Rule 4: nothing issued, nothing sent, same answer.
        return _sent_nothing("cooldown")

    code = _generate_code()
    # Bound to the address the mail goes to (`_deliver` sends to this same `user.email`).
    user.password_reset_code_hash = _hash(code, user.email)
    user.password_reset_expires_at = now + CODE_TTL
    user.password_reset_sent_at = now
    user.password_reset_attempts = 0
    db.session.commit()
    _deliver(user, code)  # rule 3: after the commit, never awaited; a failure clears the code
    return standard_body()


def login_body(user):
    """The `POST /api/auth/login` response shape (rule 6)."""
    return {
        "accessToken": issue_access_token(user.id),
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

    # Checked against the account's address NOW: a code issued for another address does not match.
    if hmac.compare_digest(user.password_reset_code_hash, _hash(raw, user.email)):
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
