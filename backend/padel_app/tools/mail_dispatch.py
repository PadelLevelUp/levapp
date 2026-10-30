"""Send a mail after the response, off the request thread (PAD-734).

The caller commits first, renders the mail, then calls ``send_later``: the user's response never
waits for SMTP, and a slow or failing mail server can neither stall nor undo the request.

- One daemon thread per mail, under the app context it was dispatched from, with its own session
  (removed afterwards). The volume is a handful of sign-up and recovery mails a day; a mail lost
  to a restart is recovered by the screen's "send a new code".
- A sent mail is logged at INFO as ``"<label> sent"`` (PAD-781).
- A failure is logged as ``"<label> failed: <exception class>"`` — the label names a user id or a
  count, never an address (B-254) — and then ``on_failure()`` runs in the same context, so it may
  read and commit. ``send_email`` has already recorded the failure on engine health.
- ``MAIL_DISPATCH_INLINE`` (app config; default: the TESTING flag) runs the same job on the caller,
  so tests see its effect when the request returns — the switch push_sender has.
"""
import threading

from flask import current_app, has_app_context

from padel_app.sql_db import db


def _inline():
    if not has_app_context():
        return False
    value = current_app.config.get("MAIL_DISPATCH_INLINE")
    if value is None:
        return bool(current_app.config.get("TESTING"))
    return bool(value)


def _job(subject, recipients, body, html, label, on_failure):
    # Looked up at call time, so a test that patches email_tools.send_email sees its double.
    from padel_app.tools import email_tools

    try:
        email_tools.send_email(subject, recipients, body=body, html=html)
        # PAD-781: a sent mail leaves a trace too, so "sent" and "never attempted" can be told apart.
        current_app.logger.info("%s sent", label)
    except Exception as exc:  # noqa: BLE001 — a mail never fails the request it came from
        current_app.logger.warning("%s failed: %s", label, type(exc).__name__)
        if on_failure is not None:
            try:
                on_failure()
            except Exception:  # noqa: BLE001
                current_app.logger.exception("%s: failure cleanup failed", label)


def _run(app, args):
    with app.app_context():
        try:
            _job(*args)
        finally:
            db.session.remove()


def send_later(subject, recipients, *, body=None, html=None, label, on_failure=None):
    """Send after the caller's response; never raises. Call it after the commit."""
    args = (subject, list(recipients), body, html, label, on_failure)
    if _inline():
        _job(*args)
        return None
    app = current_app._get_current_object()
    thread = threading.Thread(target=_run, args=(app, args), name="mail-send", daemon=True)
    thread.start()
    return thread
