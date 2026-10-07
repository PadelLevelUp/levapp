"""LevApp admin approval of self-registered coaches (auth.coach-approval).

Only a superadmin lists, approves or rejects. Notifications are best-effort:
a mail failure is logged and never fails the signup or the decision.
"""
from flask import abort, current_app

from padel_app.utils.tokens import issue_access_token
from werkzeug.security import check_password_hash

from padel_app.models import Coach, User
from padel_app.sql_db import db
from padel_app.utils.dates import utcnow_naive
from padel_app.services.email_verification_service import verification_state


def list_pending_coaches_service():
    """Pending coaches, oldest first."""
    return (
        Coach.query.filter_by(approval_status="pending")
        .order_by(Coach.created_at.asc().nullsfirst(), Coach.id.asc())
        .all()
    )


def serialize_pending_coach(coach):
    user = coach.user
    return {
        "coachId": coach.id,
        "userId": coach.user_id,
        "name": user.name if user else None,
        "username": user.username if user else None,
        "email": user.email if user else None,
        # auth.email-verification rule 10: the admin should not approve a
        # coach nobody can reach.
        # B-262: the derived state, so an account with no email is never shown as verified.
        "emailVerified": bool(user and verification_state(user) == "verified"),
        "requestedAt": coach.created_at.isoformat() + "+00:00" if coach.created_at else None,
    }


def _decide(coach_id, admin_user, target, reason=None, now=None, commit=True):
    coach = Coach.query.get_or_404(coach_id)
    if coach.approval_status == target:
        return coach  # idempotent for the same target state
    if coach.approval_status != "pending":
        abort(410, f"Coach approval is already {coach.approval_status}")

    coach.approval_status = target
    if target == "approved":
        coach.approved_at = now or utcnow_naive()
        coach.approved_by_user_id = admin_user.id if admin_user else None
        coach.rejection_reason = None
    else:
        coach.rejection_reason = (reason or None)
    if commit:
        db.session.commit()
    else:
        db.session.flush()
    return coach


def _sync_crm(coach):
    """auth.coach-crm-sync (PAD-471): upsert the status off the request thread."""
    from padel_app.services.hubspot_sync import sync_coach_status

    sync_coach_status(coach)


def approve_coach_service(coach_id, admin_user, now=None, *, defer=None):
    """Approve a pending coach.

    ``defer`` (admin.approvals-and-users rule 2, PAD-532): the staff console passes its audit
    context's ``defer``. The decision is then flushed, not committed, so it commits with its audit
    row, and the mail, push and CRM sync run after that commit. Without it (every other caller)
    the behaviour is unchanged: commit, then notify.
    """
    coach = _decide(coach_id, admin_user, "approved", now=now, commit=defer is None)
    if defer is None:
        notify_coach_approved(coach)
        _sync_crm(coach)
    else:
        coach_id_ = coach.id
        defer(lambda: _after_decision(coach_id_, notify=True))
    return coach


def reject_coach_service(coach_id, admin_user, reason=None, *, defer=None):
    coach = _decide(coach_id, admin_user, "rejected", reason=reason, commit=defer is None)
    # Rule 10 (PAD-233): a rejected coach cannot sign in. `disabled` is the
    # status the JWT blocklist loader already treats as "kill every session",
    # so this signs them out on every device without a new column.
    if coach.user is not None and coach.user.status != "disabled":
        coach.user.status = "disabled"
        if defer is None:
            db.session.commit()
        else:
            db.session.flush()
    if defer is None:
        _sync_crm(coach)
    else:
        coach_id_ = coach.id
        defer(lambda: _after_decision(coach_id_, notify=False))
    return coach


def _after_decision(coach_id, notify):
    """The side effects of a console decision, after its commit (PAD-532)."""
    coach = Coach.query.get(coach_id)
    if coach is None:
        return
    if notify:
        notify_coach_approved(coach)
    _sync_crm(coach)


class CoachRejected(Exception):
    """Login refused because the coach was rejected (rule 11)."""

    def __init__(self, reason):
        super().__init__("COACH_REJECTED")
        self.reason = reason

    def payload(self):
        return {"error": "COACH_REJECTED", "reason": self.reason}


def rejected_coach_of(user):
    """The user's Coach when it is `rejected`, else None."""
    coach = getattr(user, "coach", None)
    if coach is not None and coach.approval_status == "rejected":
        return coach
    return None


def login_body(user):
    return {
        "accessToken": issue_access_token(user.id),
        "user": {"id": user.id, "name": user.name, "role": user.role},
    }


def reapply_coach_service(username, password):
    """Rule 12: a rejected coach asks again. Checks the credentials (401),
    requires a rejected coach on a live account (410), puts the coach back in
    the queue, re-enables the login, notifies the admin and returns the login
    body."""
    from flask import abort

    user = User.query.filter_by(username=username or "").first()
    if user is None or not user.password or not check_password_hash(user.password, password or ""):
        abort(401)
    coach = rejected_coach_of(user)
    # A deleted account has no email (account_service) and cannot come back.
    if coach is None or not user.email:
        abort(410)
    coach.approval_status = "pending"
    coach.rejection_reason = None
    coach.approved_at = None
    coach.approved_by_user_id = None
    user.status = "active"
    db.session.commit()
    notify_admin_of_pending_coach(coach)
    _sync_crm(coach)
    return login_body(user)


# ── notifications (best-effort) ────────────────────────────────────────────

def _send(subject, recipients, body, html=None):
    from padel_app.tools.email_tools import send_email

    try:
        send_email(subject, recipients, body=body, html=html)
    except Exception as exc:  # noqa: BLE001 — never fail the caller on mail
        # B-254: how many recipients and the exception class, never the addresses or the
        # exception text (an SMTP refusal names the recipient).
        current_app.logger.warning(
            "coach-approval mail to %d recipient(s) failed: %s", len(recipients), type(exc).__name__
        )


def notify_admin_of_pending_coach(coach):
    """Tell the LevApp admin a coach is waiting — the ADMIN_NOTIFY_EMAIL mail
    (rule 4) when configured, plus a push to every superadmin (PAD-232,
    notifications.request-alerts rule 1; the mailbox ignores any opt-out)."""
    user = coach.user
    try:
        from padel_app.services.request_alert_service import (
            notify_request_event, pending_coach_recipients,
        )
        notify_request_event(
            "coach_approval.received", pending_coach_recipients(),
            actor=user.name if user else "",
        )
    except Exception as exc:  # noqa: BLE001 — never fail the signup
        # B-254: the exception class only; the alert path mails, so its text can carry an address.
        current_app.logger.warning("coach-approval superadmin alert failed: %s", type(exc).__name__)
    to = current_app.config.get("ADMIN_NOTIFY_EMAIL")
    if not to:
        return
    verified = "yes" if verification_state(user) == "verified" else "no"
    body = (
        f"A coach is waiting for approval.\n\n"
        f"Name: {user.name}\nUsername: {user.username}\nEmail: {user.email}\n"
        f"Email verified: {verified}\n\n"
        f"Approve or reject in the staff console: {_console_url('/approvals')}"
    )
    _send("[LevApp] Coach waiting for approval", [to], body)


def _console_url(path):
    """admin.approvals-and-users rule 3: the staff console's page for ``path``."""
    base = (current_app.config.get("ADMIN_CONSOLE_URL") or "").rstrip("/")
    return f"{base}{path}" if base else path


def notify_coach_approved(coach):
    """Rule 5: branded, in the coach's language, best-effort."""
    from padel_app.tools.email_templates import render_coach_approved_email

    user = coach.user
    if not user:
        return
    # PAD-232: a push as well as the branded mail (notifications.request-alerts
    # rule 1). Push only — the mail below is the existing rule-5 email.
    try:
        from padel_app.services.request_alert_service import (
            wants_request_alerts,
        )
        from padel_app.utils.expo_push import send_expo_push_to_user
        from padel_app.utils.push_notifications import send_push_notification
        from padel_app.services.request_alert_service import render_copy, _lang, PATHS
        if wants_request_alerts(user):
            title, body = render_copy("coach_approval.decided", _lang(user))
            # PAD-327: one destination, named once, sent to both channels.
            path = PATHS["coach_approval.decided"]
            send_push_notification(user.id, title, body, url=path)
            send_expo_push_to_user(user.id, title, body, data={"type": "path", "path": path})
    except Exception as exc:  # noqa: BLE001
        current_app.logger.warning("coach-approval push to %s failed: %s", user.id, exc)
    if not user.email:
        return
    subject, text, html = render_coach_approved_email(user)
    _send(subject, [user.email], text, html=html)
