"""LevApp admin approval of self-registered coaches (auth.coach-approval).

Only a superadmin lists, approves or rejects. Notifications are best-effort:
a mail failure is logged and never fails the signup or the decision.
"""
from flask import abort, current_app

from padel_app.models import Coach, User
from padel_app.sql_db import db
from padel_app.utils.dates import utcnow_naive


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
        "requestedAt": coach.created_at.isoformat() + "+00:00" if coach.created_at else None,
    }


def _decide(coach_id, admin_user, target, reason=None, now=None):
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
    db.session.commit()
    return coach


def approve_coach_service(coach_id, admin_user, now=None):
    coach = _decide(coach_id, admin_user, "approved", now=now)
    notify_coach_approved(coach)
    return coach


def reject_coach_service(coach_id, admin_user, reason=None):
    return _decide(coach_id, admin_user, "rejected", reason=reason)


# ── notifications (best-effort) ────────────────────────────────────────────

def _send(subject, recipients, body):
    from padel_app.tools.email_tools import send_email

    try:
        send_email(subject, recipients, body=body)
    except Exception as exc:  # noqa: BLE001 — never fail the caller on mail
        current_app.logger.warning(
            "coach-approval mail to %s failed: %s", recipients, exc
        )


def notify_admin_of_pending_coach(coach):
    """Tell the LevApp admin a coach is waiting — only when ADMIN_NOTIFY_EMAIL is set."""
    to = current_app.config.get("ADMIN_NOTIFY_EMAIL")
    if not to:
        return
    user = coach.user
    body = (
        f"A coach is waiting for approval.\n\n"
        f"Name: {user.name}\nUsername: {user.username}\nEmail: {user.email}\n\n"
        f"Approve or reject under Settings → Admin."
    )
    _send("[LevApp] Coach waiting for approval", [to], body)


def notify_coach_approved(coach):
    user = coach.user
    if not user or not user.email:
        return
    body = (
        f"Hi {user.name},\n\nYour LevApp coach account has been approved. "
        f"Sign in and create or join your club to get started."
    )
    _send("[LevApp] Your coach account is approved", [user.email], body)
