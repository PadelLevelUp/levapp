import re

from flask import Blueprint, abort, request, jsonify
from flask_jwt_extended import create_access_token, jwt_required, get_jwt_identity, get_jwt
from werkzeug.security import check_password_hash

from padel_app.models import User, TokenBlocklist
from padel_app.sql_db import db
from padel_app.services.account_service import delete_account_service
from padel_app.services.user_service import (
    OWN_PROFILE_FIELDS,
    ProfileValidationError,
    update_own_profile_service,
)
from padel_app.services.registration_service import (
    RegistrationError,
    register_user_service,
)
from padel_app.services.club_service import latest_pending_club_join_request
from padel_app.services.coach_approval_service import (
    reapply_coach_service,
    rejected_coach_of,
)
from padel_app.services.email_verification_service import (
    EmailVerificationError,
    confirm_code,
    resend_available_in,
    send_code,
    verification_state,
)
from padel_app.services.password_recovery_service import (
    PasswordRecoveryError,
    confirm_recovery,
    request_recovery,
)
from padel_app.utils.debug_flags import debug_endpoints_enabled
from padel_app.utils.rate_limit import rate_limited

bp = Blueprint("auth_api", __name__, url_prefix="/api/auth")


def _student_coaches(user):
    """`[{id, name}]` of the coaches a student is on the roster of; `[]` for a coach."""
    player = getattr(user, "player", None)
    if user.coach or player is None:
        return []
    coaches = [rel.coach for rel in player.coaches_relations if rel.coach is not None]
    return [
        {"id": c.id, "name": c.name}
        for c in sorted(coaches, key=lambda c: (c.name or "").lower())
    ]


def _serialize_me(user):
    """The payload the app hydrates its session and Settings profile form from."""
    coach = user.coach
    pending = latest_pending_club_join_request(coach)
    return {
        # auth.register rule 9 / auth.coach-approval: the client routes a coach
        # by `coachApproval` first (pending / rejected screens), then by
        # `clubs` (club onboarding vs dashboard). `pendingClubJoinRequest` is
        # the most recent pending request (clubs.join-request rule 6).
        "coachApproval": coach.approval_status if coach else None,
        "clubs": [{"id": c.id, "name": c.name} for c in coach.clubs] if coach else [],
        # auth.register rule 9 / players.join-token rule 8: a student's coaches,
        # so "not connected to a coach yet" is read from here and never
        # inferred from an empty calendar (TestFlight feedback 2026-09-07).
        "coaches": _student_coaches(user),
        "pendingClubJoinRequest": (
            {"id": pending.id, "clubId": pending.club_id, "clubName": pending.club.name}
            if pending else None
        ),
        "id": user.id,
        "username": user.username,
        "name": user.name,
        "roles": ["coach"] if user.coach else ["player"],
        "coachId": user.coach.id if user.coach else None,
        "isSuperAdmin": user.is_superadmin,
        "language": getattr(user, "language", "pt") or "pt",
        # PAD-81: the Settings profile form is hydrated from here instead of
        # from hardcoded local defaults.
        "abbreviation": user.abbreviation_display,
        "email": user.email,
        "phone": user.phone,
        # auth.email-verification rule 2: "verified" | "pending" | "unverified".
        # Clients hold a `pending` user on the code screen; nothing else.
        "emailVerification": verification_state(user),
        "emailVerificationResendInSeconds": resend_available_in(user),
        # PAD-112: the student's standing class-invitation block preferences.
        # Per-user, so they ride on this route rather than on a coach-scoped one
        # (settings.role-scope rule 8 keeps /auth/me open to both roles).
        "blockAutoInvitations": bool(user.notif_block_auto_invitations),
        "blockManualInvitations": bool(user.notif_block_manual_invitations),
        "blockAllNotifications": bool(user.notif_block_all),
        "notificationBlockReason": user.notif_block_reason or "",
        # PAD-232: request alerts opt-out (notifications.request-alerts rule 6).
        "requestAlerts": user.notif_request_alerts is not False,
    }

@bp.post("/register")
@rate_limited("register")
def register():
    """auth.register — self-service signup for coaches and students."""
    data = request.get_json(silent=True) or {}
    try:
        user = register_user_service(data)
    except RegistrationError as exc:
        db.session.rollback()
        payload = {"error": exc.message}
        if exc.field:
            payload["field"] = exc.field
        return jsonify(payload), exc.status

    access_token = create_access_token(identity=str(user.id))
    return jsonify({
        "accessToken": access_token,
        "user": {
            "id": user.id,
            "name": user.name,
            "role": user.role,
            "emailVerification": verification_state(user),
        },
    }), 201


# ── auth.email-verification ────────────────────────────────────────────────

@bp.post("/email-verification/send")
@jwt_required()
def email_verification_send():
    """Rule 4: mail a fresh 6-digit code to the caller's own email."""
    user = User.query.get_or_404(int(get_jwt_identity()))
    try:
        body = send_code(user)
    except EmailVerificationError as exc:
        db.session.rollback()
        return jsonify(exc.payload()), exc.status
    return jsonify(body), 200


@bp.post("/email-verification/confirm")
@jwt_required()
def email_verification_confirm():
    """Rule 5: check the code; on success answer with the /me payload."""
    user = User.query.get_or_404(int(get_jwt_identity()))
    data = request.get_json(silent=True) or {}
    try:
        confirm_code(user, data.get("code"))
    except EmailVerificationError as exc:
        return jsonify(exc.payload()), exc.status
    return jsonify(_serialize_me(user)), 200


@bp.get("/email-verification/debug/last-code")
@jwt_required(optional=True)
def email_verification_debug_last_code():
    """Rule 11 — E2E only. 404 unless E2E_DEBUG_ENDPOINTS is on. Returns the
    code from the newest captured mail addressed to the caller's own email,
    or to `?email=` — the Maestro runner holds no token, and the outbox only
    exists on the flag-gated test backend, so there is nothing to protect."""
    if not debug_endpoints_enabled():
        abort(404)
    from padel_app.tools.email_tools import last_captured_for

    email = (request.args.get("email") or "").strip()
    if not email:
        identity = get_jwt_identity()
        if identity is None:
            return jsonify({"error": "NO_EMAIL"}), 401
        email = User.query.get_or_404(int(identity)).email
    msg = last_captured_for(email)
    if msg is None:
        return jsonify({"error": "NO_MAIL"}), 404
    match = re.search(r"\b(\d{6})\b", msg.get("body") or "")
    if not match:
        return jsonify({"error": "NO_CODE"}), 404
    return jsonify({"code": match.group(1), "subject": msg["subject"]}), 200


# ── auth.password-recovery ─────────────────────────────────────────────────

@bp.post("/password-recovery/request")
@rate_limited("recovery")
def password_recovery_request():
    """Rule 2: always the same 200, whether or not the email has an account."""
    data = request.get_json(silent=True) or {}
    try:
        body = request_recovery(data.get("email"))
    except PasswordRecoveryError as exc:
        db.session.rollback()
        return jsonify(exc.payload()), exc.status
    return jsonify(body), 200


@bp.post("/password-recovery/confirm")
@rate_limited("recovery")
def password_recovery_confirm():
    """Rule 6: code + new password; answers with the login body."""
    data = request.get_json(silent=True) or {}
    try:
        body = confirm_recovery(data.get("email"), data.get("code"), data.get("newPassword"))
    except PasswordRecoveryError as exc:
        return jsonify(exc.payload()), exc.status
    return jsonify(body), 200


@bp.post("/login")
@rate_limited("login")
def login():
    data = request.get_json() or {}

    username = data.get("username")
    password = data.get("password")
    

    if not username or not password:
        return {"error": "Email and password required"}, 400

    user = User.query.filter_by(username=username).first()

    if not user or not check_password_hash(user.password, password):
        return {"error": "Invalid credentials"}, 401

    # auth.coach-approval rule 11 (PAD-233): right credentials, rejected
    # coach — say why, issue nothing. Wrong credentials stay 401 above so the
    # status never leaks to a guesser.
    rejected = rejected_coach_of(user)
    if rejected is not None:
        return {"error": "COACH_REJECTED", "reason": rejected.rejection_reason}, 403

    access_token = create_access_token(identity=str(user.id))

    return {
        "accessToken": access_token,
        "user": {
            "id": user.id,
            "name": user.name,
            "role": user.role,
        }
    }
    
@bp.post("/coach-approval/reapply")
def coach_approval_reapply():
    """auth.coach-approval rule 12 (PAD-233): a rejected coach asks again."""
    data = request.get_json(silent=True) or {}
    body = reapply_coach_service(data.get("username"), data.get("password"))
    return jsonify(body), 200


@bp.post("/logout")
@jwt_required()
def logout():
    jti = get_jwt()["jti"]
    db.session.add(TokenBlocklist(jti=jti))
    db.session.commit()
    return {"message": "Successfully logged out"}, 200

@bp.get("/me")
@jwt_required()
def me():
    user_id = int(get_jwt_identity())
    user = User.query.get_or_404(user_id)

    return jsonify(_serialize_me(user))


@bp.delete("/me")
@jwt_required()
def delete_me():
    user_id = int(get_jwt_identity())
    delete_account_service(user_id)
    return jsonify({"message": "Account deleted"}), 200


@bp.patch("/me")
@jwt_required()
def update_me():
    user_id = int(get_jwt_identity())
    data = request.get_json() or {}
    # PAD-81: only the fields a user may change on their own account, and only
    # the ones actually present in the payload (partial update).
    payload = {k: v for k, v in data.items() if k in OWN_PROFILE_FIELDS}

    try:
        user = update_own_profile_service(user_id, payload)
    except ProfileValidationError as exc:
        db.session.rollback()
        return {"error": exc.message}, exc.status

    return jsonify(_serialize_me(user))