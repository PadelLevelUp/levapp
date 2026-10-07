"""auth.email-verification (PAD-234).

A self-registered person types back a 6-digit code mailed to them. The code
is kept only as an HMAC keyed by SECRET_KEY, lives 15 minutes, dies on the
5th wrong attempt, and is replaced by every new send. Only self-signup and a
self-service email change put a user in the `pending` state
(`email_verification_required`); an email a coach typed never does.

Every function takes `now=` so tests never mock the clock (R-008).
"""
import hmac
import re
import secrets
from datetime import timedelta
from hashlib import sha256

from flask import current_app

from padel_app.sql_db import db
from padel_app.utils.dates import utcnow_naive

CODE_LENGTH = 6
CODE_TTL = timedelta(minutes=15)
RESEND_COOLDOWN = timedelta(seconds=60)
MAX_ATTEMPTS = 5

_CODE_RE = re.compile(r"^\d{6}$")


class EmailVerificationError(Exception):
    """A rejected send/confirm. `code` is the machine-readable `error`."""

    def __init__(self, code, status, **extra):
        super().__init__(code)
        self.code = code
        self.status = status
        self.extra = extra

    def payload(self):
        return {"error": self.code, **self.extra}


def verification_required():
    return bool(current_app.config.get("EMAIL_VERIFICATION_REQUIRED", True))


def verification_state(user):
    """`verified` | `pending` | `unverified` — rule 2. With no email there is nothing verified (B-262),
    whatever an older row still holds."""
    if not user.email:
        return "unverified"
    if user.email_verified_at is not None:
        return "verified"
    if user.email and user.email_verification_required:
        return "pending"
    return "unverified"


def resend_available_in(user, now=None):
    """Seconds until `send_code` stops answering 429; 0 when it can be called."""
    sent_at = user.email_verification_sent_at
    if sent_at is None:
        return 0
    now = now or utcnow_naive()
    left = (RESEND_COOLDOWN - (now - sent_at)).total_seconds()
    return int(left) + 1 if left > 0 else 0


def _hash(code, address):
    """PAD-498: the code is bound to the address it was mailed to (part of the HMAC input), so it
    verifies only that address, whatever order an email change and the code's own commit land in."""
    key = (current_app.config.get("SECRET_KEY") or "dev-secret-key").encode()
    bound = f"{(address or '').strip().lower()}\n{code}"
    return hmac.new(key, bound.encode(), sha256).hexdigest()


def _generate_code():
    return f"{secrets.randbelow(10 ** CODE_LENGTH):0{CODE_LENGTH}d}"


def _clear_code(user):
    user.email_verification_code_hash = None
    user.email_verification_expires_at = None
    user.email_verification_attempts = 0


def _issue(user, now):
    code = _generate_code()
    user.email_verification_code_hash = _hash(code, user.email)  # the address `_deliver` mails
    user.email_verification_expires_at = now + CODE_TTL
    user.email_verification_sent_at = now
    user.email_verification_attempts = 0
    return code


def _deliver(user, code):
    from padel_app.tools.email_templates import render_verification_code_email
    from padel_app.tools.email_tools import send_email

    subject, text, html = render_verification_code_email(user, code)
    send_email(subject, [user.email], body=text, html=html)


def send_code(user, now=None, *, commit=True, defer=None):
    """Rule 4: issue a fresh code and mail it. Commits. Returns the 200 body.

    ``defer`` (the staff console, PAD-532): the code is flushed, not committed, so it commits with
    the console's audit row, and the mail goes out after that commit (admin.foundation rule 8). A
    mail that then fails clears the code again, in its own commit.
    """
    now = now or utcnow_naive()
    if user.email_verified_at is not None:
        raise EmailVerificationError("ALREADY_VERIFIED", 409)
    if not user.email:
        raise EmailVerificationError("NO_EMAIL", 400)
    sent_at = user.email_verification_sent_at
    if sent_at is not None and now - sent_at < RESEND_COOLDOWN:
        retry = int((RESEND_COOLDOWN - (now - sent_at)).total_seconds())
        raise EmailVerificationError("RESEND_TOO_SOON", 429, retryAfterSeconds=max(retry, 1))

    user.email_verification_required = True
    code = _issue(user, now)
    if defer is not None:
        db.session.flush()
        user_id = user.id
        defer(lambda: _deliver_after_commit(user_id, code))
        return {
            "email": user.email,
            "expiresInSeconds": int(CODE_TTL.total_seconds()),
            "resendAvailableInSeconds": int(RESEND_COOLDOWN.total_seconds()),
        }
    try:
        _deliver(user, code)
    except Exception as exc:  # noqa: BLE001 — surface as 503, never 500
        # B-254: the user id and the exception class, never the address or the exception text (an SMTP
        # refusal names the recipient).
        current_app.logger.warning("verification mail to user %s failed: %s", user.id, type(exc).__name__)
        _clear_code(user)
        user.email_verification_sent_at = None
        db.session.commit() if commit else db.session.flush()
        raise EmailVerificationError("MAIL_FAILED", 503) from exc
    db.session.commit() if commit else db.session.flush()
    return {
        "email": user.email,
        "expiresInSeconds": int(CODE_TTL.total_seconds()),
        "resendAvailableInSeconds": int(RESEND_COOLDOWN.total_seconds()),
    }


def _deliver_after_commit(user_id, code):
    """The console's resend, after its commit: mail the code, or clear it if the mail fails."""
    from padel_app.models import User

    user = User.query.get(user_id)
    if user is None:
        return
    try:
        _deliver(user, code)
    except Exception as exc:  # noqa: BLE001
        current_app.logger.warning("verification mail to user %s failed: %s", user.id, type(exc).__name__)
        _clear_code(user)
        user.email_verification_sent_at = None
        db.session.commit()


def forget_verification(user):
    """B-262 (rule 2; settings.profile rule 9): an account whose email is cleared has nothing to be
    verified — no timestamp, nothing required, no pending code — so it reads `unverified`. Does not
    commit: the caller's save does."""
    user.email_verified_at = None
    user.email_verification_required = False
    user.email_verification_sent_at = None
    _clear_code(user)


def begin_verification(user, now=None):
    """Rules 1 and 6: mark the account as needing verification and send the
    first code, best-effort. Used by self-signup and by a self-service email
    change. Commits. When the gate is off the user is verified on the spot."""
    now = now or utcnow_naive()
    if not user.email:
        return
    if not verification_required():
        user.email_verification_required = False
        user.email_verified_at = now
        _clear_code(user)
        db.session.commit()
        return
    user.email_verification_required = True
    user.email_verified_at = None
    code = _issue(user, now)
    try:
        _deliver(user, code)
    except Exception as exc:  # noqa: BLE001 — the account still exists; "send a new code" recovers
        # B-254: the user id and the exception class, never the address or the exception text.
        current_app.logger.warning(
            "first verification mail to user %s failed: %s", user.id, type(exc).__name__
        )
        _clear_code(user)
        user.email_verification_sent_at = None
    db.session.commit()


def confirm_code(user, code, now=None):
    """Rule 5. Commits on success and on a consumed attempt."""
    now = now or utcnow_naive()
    raw = (code or "").strip() if isinstance(code, str) else ""
    stored = user.email_verification_code_hash
    attempts_left = max(MAX_ATTEMPTS - (user.email_verification_attempts or 0), 0)

    if not _CODE_RE.match(raw):
        # Malformed input never consumes an attempt.
        raise EmailVerificationError("INVALID_CODE", 400, attemptsLeft=attempts_left)

    expired = (
        stored is None
        or user.email_verification_expires_at is None
        or now > user.email_verification_expires_at
        or attempts_left <= 0
    )
    if expired:
        raise EmailVerificationError("CODE_EXPIRED", 410)

    if hmac.compare_digest(stored, _hash(raw, user.email)):  # the account's address now
        user.email_verified_at = now
        user.email_verification_required = False
        _clear_code(user)
        db.session.commit()
        return user

    user.email_verification_attempts = (user.email_verification_attempts or 0) + 1
    attempts_left = MAX_ATTEMPTS - user.email_verification_attempts
    if attempts_left <= 0:
        # The 5th wrong attempt kills the code: the right one is 410 from now on.
        user.email_verification_code_hash = None
        user.email_verification_expires_at = None
    db.session.commit()
    raise EmailVerificationError("INVALID_CODE", 400, attemptsLeft=max(attempts_left, 0))
