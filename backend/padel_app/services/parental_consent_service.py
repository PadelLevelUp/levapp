"""auth.parental-consent (PAD-198).

A person under their country's age of digital consent who signs up on their
own gets an account nobody can use until a parent or legal guardian consents
through an emailed web form. The guardian can decline before consenting or
withdraw afterwards; either removes the account through
`delete_account_service`. Tokens are 32 random bytes, stored only as SHA-256
hashes. Every function takes `now=` so tests never mock the clock (R-008).
"""
import hashlib
import json
import math
import secrets
from datetime import timedelta

from flask import current_app
from werkzeug.security import check_password_hash

from padel_app.models import DigitalConsentAge, GuardianConsent, User
from padel_app.sql_db import db
from padel_app.utils.dates import utcnow_naive

CONSENT_TTL = timedelta(days=7)
RESEND_COOLDOWN = timedelta(seconds=60)
RELATIONSHIPS = ("parent", "legal_guardian")
DEFAULT_TERMS_VERSION = "2026-09-06"


class ConsentError(Exception):
    """A rejected consent call. `code` is the machine-readable `error`."""

    def __init__(self, code, status, **extra):
        super().__init__(code)
        self.code = code
        self.status = status
        self.extra = extra

    def payload(self):
        return {"error": self.code, **self.extra}


# ── who is a minor (rule 1) ────────────────────────────────────────────────

def consent_age_for(country):
    row = db.session.get(DigitalConsentAge, (country or "").upper())
    if row is not None:
        return int(row.age)
    return int(current_app.config.get("DIGITAL_CONSENT_DEFAULT_AGE", 16) or 16)


def age_on(birth, today):
    return today.year - birth.year - ((today.month, today.day) < (birth.month, birth.day))


def is_minor(birth, country, today):
    return age_on(birth, today) < consent_age_for(country)


# ── helpers ────────────────────────────────────────────────────────────────

def _hash(token):
    return hashlib.sha256((token or "").encode()).hexdigest()


def mask_email(address):
    if not address or "@" not in address:
        return None
    local, domain = address.split("@", 1)
    return f"{local[:1]}***@{domain}"


def terms_version():
    return current_app.config.get("LEGAL_TERMS_VERSION") or DEFAULT_TERMS_VERSION


def _origin():
    from padel_app.tools.email_templates import web_origin

    return web_origin().rstrip("/")


def consent_url(token):
    return f"{_origin()}/guardian-consent/{token}"


def revoke_url(token):
    return f"{_origin()}/guardian-consent/revoke/{token}"


def consent_for(user):
    return GuardianConsent.query.filter_by(user_id=user.id).first()


def resend_available_in(row, now=None):
    if row is None or row.consent_sent_at is None:
        return 0
    left = (RESEND_COOLDOWN - ((now or utcnow_naive()) - row.consent_sent_at)).total_seconds()
    return int(math.ceil(left)) if left > 0 else 0


def pending_body(user, now=None):
    """The part of a 201 / 403 that tells the client where the mail went."""
    row = consent_for(user)
    return {
        "guardianEmail": mask_email(row.guardian_email) if row else None,
        "resendAvailableInSeconds": resend_available_in(row, now),
    }


def _snapshot(user):
    return {
        "name": user.name,
        "username": user.username,
        "birthDate": user.birth_date.isoformat() if user.birth_date else None,
        "country": user.country,
        "role": user.role,
    }


# ── the consent request (rules 3, 5, 6) ────────────────────────────────────

def _issue_consent_token(row, now):
    token = secrets.token_urlsafe(32)
    row.consent_token_hash = _hash(token)
    row.consent_expires_at = now + CONSENT_TTL
    row.consent_sent_at = now
    return token


def _send_consent_request(user, row, token):
    from padel_app.tools.email_templates import render_guardian_consent_request_email
    from padel_app.tools.email_tools import send_email

    subject, text, html = render_guardian_consent_request_email(
        user, consent_url(token), consent_age_for(user.country)
    )
    try:
        send_email(subject, [row.guardian_email], body=text, html=html)
        return True
    except Exception as exc:  # noqa: BLE001 — the account stays; resend recovers
        current_app.logger.warning("guardian consent mail to %s failed: %s", row.guardian_email, exc)
        return False


def start_consent(user, guardian_email, now=None):
    """Rule 3: create the consent row, issue a link and mail the guardian."""
    now = now or utcnow_naive()
    row = GuardianConsent(user_id=user.id, guardian_email=guardian_email, requested_at=now)
    db.session.add(row)
    token = _issue_consent_token(row, now)
    db.session.commit()
    if not _send_consent_request(user, row, token):
        row.consent_sent_at = None  # let the child resend at once
        db.session.commit()
    return row


def resend_consent(username, password, guardian_email=None, now=None):
    """Rule 5: a fresh link (old one dies), optionally to a corrected address."""
    from padel_app.services.registration_service import EMAIL_RE

    now = now or utcnow_naive()
    user = User.query.filter_by(username=(username or "").strip()).first()
    if user is None or not user.password or not check_password_hash(user.password, password or ""):
        raise ConsentError("INVALID_CREDENTIALS", 401)
    row = consent_for(user)
    if user.guardian_consent_status != "pending" or row is None:
        raise ConsentError("NOT_PENDING", 409)
    wait = resend_available_in(row, now)
    if wait:
        raise ConsentError("RESEND_TOO_SOON", 429, retryAfterSeconds=wait)
    if guardian_email is not None:
        corrected = guardian_email.strip().lower() if isinstance(guardian_email, str) else ""
        if not EMAIL_RE.match(corrected):
            raise ConsentError("INVALID_GUARDIAN_EMAIL", 400, field="guardianEmail")
        if corrected == (user.email or "").lower():
            raise ConsentError("GUARDIAN_EMAIL_IS_OWN", 400, field="guardianEmail")
        row.guardian_email = corrected
    token = _issue_consent_token(row, now)
    db.session.commit()
    if not _send_consent_request(user, row, token):
        row.consent_sent_at = None
        db.session.commit()
        raise ConsentError("MAIL_FAILED", 503)
    return {
        "guardianEmail": mask_email(row.guardian_email),
        "resendAvailableInSeconds": int(RESEND_COOLDOWN.total_seconds()),
    }


# ── the consent page (rules 7, 8, 9) ───────────────────────────────────────

def _open_consent(token, now):
    row = GuardianConsent.query.filter_by(consent_token_hash=_hash(token)).first() if token else None
    if row is None or row.user is None:
        raise ConsentError("CONSENT_LINK_EXPIRED", 410)
    if row.user.guardian_consent_status in ("granted", "revoked"):
        raise ConsentError("ALREADY_DECIDED", 409)
    if row.consent_expires_at is None or now > row.consent_expires_at:
        raise ConsentError("CONSENT_LINK_EXPIRED", 410)
    return row


def view_consent(token, now=None):
    """Rule 7: what the guardian is asked to confirm. Changes nothing."""
    row = _open_consent(token, now or utcnow_naive())
    return {
        "minor": _snapshot(row.user),
        "guardianEmail": row.guardian_email,
        "termsVersion": terms_version(),
        "expiresAt": row.consent_expires_at.isoformat() + "Z",
    }


def _send_confirmation(user, row, revoke_token):
    from padel_app.tools.email_templates import render_guardian_consent_confirmed_email
    from padel_app.tools.email_tools import send_email

    subject, text, html = render_guardian_consent_confirmed_email(user, revoke_url(revoke_token))
    try:
        send_email(subject, [row.guardian_email], body=text, html=html)
    except Exception as exc:  # noqa: BLE001 — consent is recorded either way
        current_app.logger.warning("guardian confirmation mail to %s failed: %s", row.guardian_email, exc)


def give_consent(token, data, ip=None, now=None):
    """Rule 8: record the consent, open the account, start the minor's own
    email verification, mail the guardian the withdraw link."""
    now = now or utcnow_naive()
    row = _open_consent(token, now)
    data = data or {}
    name = data.get("guardianName")
    name = name.strip() if isinstance(name, str) else ""
    if not name or len(name) > 120:
        raise ConsentError("INVALID_GUARDIAN_NAME", 400, field="guardianName")
    if data.get("relationship") not in RELATIONSHIPS:
        raise ConsentError("INVALID_RELATIONSHIP", 400, field="relationship")
    if data.get("confirmMinorDetails") is not True:
        raise ConsentError("CONFIRMATION_REQUIRED", 400, field="confirmMinorDetails")
    if data.get("acceptTerms") is not True:
        raise ConsentError("TERMS_NOT_ACCEPTED", 400, field="acceptTerms")

    user = row.user
    row.guardian_name = name
    row.relationship = data["relationship"]
    row.minor_snapshot = json.dumps(_snapshot(user), ensure_ascii=False)
    row.terms_version = terms_version()
    row.consented_at = now
    row.consent_ip = (ip or "")[:64] or None
    revoke_token = secrets.token_urlsafe(32)
    row.revoke_token_hash = _hash(revoke_token)
    user.guardian_consent_status = "granted"
    db.session.commit()

    # auth.email-verification rule 6, deferred to now for a minor.
    from padel_app.services.email_verification_service import begin_verification

    begin_verification(user)

    coach = getattr(user, "coach", None)
    if coach is not None and coach.approval_status == "pending":
        from padel_app.services.coach_approval_service import notify_admin_of_pending_coach

        notify_admin_of_pending_coach(coach)

    _send_confirmation(user, row, revoke_token)
    return {"ok": True}


def _remove(row, now):
    """Rule 9: withdrawn or declined — anonymise through account deletion.
    The consent row stays as the audit record."""
    from padel_app.services.account_service import delete_account_service

    row.revoked_at = now
    row.user.guardian_consent_status = "revoked"
    db.session.commit()
    delete_account_service(row.user_id)


def decline_consent(token, data, now=None):
    now = now or utcnow_naive()
    row = _open_consent(token, now)
    if (data or {}).get("confirm") is not True:
        raise ConsentError("CONFIRM_REQUIRED", 400)
    _remove(row, now)
    return {"ok": True}


def _open_revoke(token):
    row = GuardianConsent.query.filter_by(revoke_token_hash=_hash(token)).first() if token else None
    if row is None or row.revoked_at is not None or row.user is None:
        raise ConsentError("CONSENT_LINK_EXPIRED", 410)
    return row


def view_revoke(token):
    row = _open_revoke(token)
    return {
        "minor": {"name": row.user.name, "username": row.user.username},
        "consentedAt": row.consented_at.isoformat() + "Z" if row.consented_at else None,
    }


def revoke_consent(token, data, now=None):
    now = now or utcnow_naive()
    row = _open_revoke(token)
    if (data or {}).get("confirm") is not True:
        raise ConsentError("CONFIRM_REQUIRED", 400)
    _remove(row, now)
    return {"ok": True}


# ── test transport (rule 12) ───────────────────────────────────────────────

def last_links_for(email):
    """Newest consent and withdraw links captured for `email` (E2E only)."""
    import re

    from padel_app.tools.email_tools import OUTBOX

    wanted = (email or "").strip().lower()
    consent = revoke = None
    for msg in reversed(OUTBOX):
        if not any((r or "").strip().lower() == wanted for r in msg["recipients"]):
            continue
        body = msg.get("body") or ""
        if revoke is None:
            m = re.search(r"(https?://\S+/guardian-consent/revoke/([A-Za-z0-9_\-]+))", body)
            if m:
                revoke = m
        if consent is None:
            m = re.search(r"(https?://\S+/guardian-consent/(?!revoke/)([A-Za-z0-9_\-]+))", body)
            if m:
                consent = m
        if consent and revoke:
            break
    return {
        "consentUrl": consent.group(1) if consent else None,
        "consentToken": consent.group(2) if consent else None,
        "revokeUrl": revoke.group(1) if revoke else None,
        "revokeToken": revoke.group(2) if revoke else None,
    }
