"""Outbound mail.

`send_email` is the single door: coach-approval mails and the email
verification code (auth.email-verification) all go through it, so the two
non-SMTP paths live here and nowhere else:

- `E2E_DEBUG_ENDPOINTS` on (the Playwright / Maestro backend): every message is
  appended to the in-process `OUTBOX` and nothing is sent. The debug route
  `GET /api/auth/email-verification/debug/last-code` reads the code back from
  it (auth.email-verification rule 11).
- No `MAIL_USERNAME` configured (a bare dev box): raise, so callers that are
  best-effort log it and callers that must know (the "send a new code" route)
  answer 503 instead of pretending.
- `MAIL_ALLOWED_RECIPIENTS` set (staging): recipients outside the list are
  dropped and logged; if nobody is left the send raises the same way, because
  staging's database is a copy of prod's and must never mail a real coach.
"""
import os
from collections import deque

from flask import current_app
from flask_mail import Message

from ..mail import mail
from ..utils.dates import utcnow_naive
from ..utils.debug_flags import debug_endpoints_enabled

#: Last messages captured under E2E_DEBUG_ENDPOINTS, newest last.
OUTBOX = deque(maxlen=200)


class MailNotConfigured(RuntimeError):
    """No sender is configured: the message was not sent."""


class MailRecipientNotAllowed(RuntimeError):
    """Every recipient is outside MAIL_ALLOWED_RECIPIENTS: nothing was sent."""


def allowed_recipients(recipients):
    """The subset of `recipients` the environment may mail (rule 12).

    Empty `MAIL_ALLOWED_RECIPIENTS` means everyone. An entry starting with `@`
    matches the whole domain; anything else must match the address exactly.
    Case-insensitive."""
    rules = current_app.config.get("MAIL_ALLOWED_RECIPIENTS") or ()
    if not rules:
        return list(recipients)
    kept = []
    for address in recipients:
        lowered = (address or "").strip().lower()
        if any(
            lowered.endswith(rule) if rule.startswith("@") else lowered == rule
            for rule in rules
        ):
            kept.append(address)
    return kept


def _sender():
    """The From address, which is not necessarily the SMTP login.

    Workspace lets one seat send as its aliases, so the app authenticates as a
    real mailbox (`MAIL_USERNAME`, e.g. admin@levapp.app) and sends as a
    no-reply alias (`MAIL_DEFAULT_SENDER`, e.g. noreply@levapp.app). Falling
    back to the login keeps every environment that sets only MAIL_USERNAME
    working unchanged.
    """
    cfg = current_app.config
    return (
        cfg.get("MAIL_DEFAULT_SENDER")
        or os.environ.get("MAIL_DEFAULT_SENDER")
        or cfg.get("MAIL_USERNAME")
        or os.environ.get("MAIL_USERNAME")
        or ""
    )


def send_email(subject, recipients, body=None, html=None):
    if not (body or html):
        raise ValueError("Either body or html must be provided")

    if debug_endpoints_enabled():
        OUTBOX.append({
            "subject": subject,
            "recipients": list(recipients),
            "body": body,
            "html": html,
            "sentAt": utcnow_naive(),
        })
        return "Captured"

    sender = _sender()
    if not sender:
        raise MailNotConfigured("MAIL_USERNAME is not configured; mail not sent")

    kept = allowed_recipients(recipients)
    dropped = [r for r in recipients if r not in kept]
    if dropped:
        current_app.logger.warning(
            "mail to %s dropped: outside MAIL_ALLOWED_RECIPIENTS (%r)", dropped, subject
        )
    if not kept:
        raise MailRecipientNotAllowed(f"no allowed recipient among {list(recipients)}")

    msg = Message(subject, sender=sender, recipients=kept)
    if body:
        msg.body = body
    if html:
        msg.html = html
    mail.send(msg)
    return "Sent"


def last_captured_for(email):
    """Newest OUTBOX message addressed to `email` (case-insensitive), or None."""
    wanted = (email or "").strip().lower()
    if not wanted:
        return None
    for msg in reversed(OUTBOX):
        if any((r or "").strip().lower() == wanted for r in msg["recipients"]):
            return msg
    return None
