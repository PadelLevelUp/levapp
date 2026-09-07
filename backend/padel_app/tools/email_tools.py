"""Outbound mail.

`send_email` is the single door: coach-approval mails and the email
verification code (auth.email-verification) all go through it, so the two
non-SMTP paths live here and nowhere else:

- `E2E_DEBUG_ENDPOINTS` on (the Playwright / Maestro backend): every message is
  appended to the in-process `OUTBOX` and nothing is sent. The debug route
  `GET /api/auth/email-verification/debug/last-code` reads the code back from
  it (auth.email-verification rule 11).
- No `MAIL_USERNAME` configured (staging, a bare dev box): raise, so callers
  that are best-effort log it and callers that must know (the "send a new
  code" route) answer 503 instead of pretending.
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


def _sender():
    return current_app.config.get("MAIL_USERNAME") or os.environ.get("MAIL_USERNAME") or ""


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

    msg = Message(subject, sender=sender, recipients=recipients)
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
