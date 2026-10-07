"""admin.foundation (PAD-531): the staff console's API, `/admin/api/*`.

Registered in every environment; `before_request` answers 404 on any host outside ADMIN_HOSTS
(rule 11), stamps a request id (rule 10) and, except on the two unauthenticated routes, verifies
the admin token and loads the role row (rules 3–4). Handlers stay thin (R-005); responses are
camelCase (R-022); times are UTC ISO (R-023).
"""
from flask import Blueprint, current_app, g, jsonify, request

from padel_app.services.admin import audit_service, auth_service, role_service
from padel_app.utils.admin_auth import audited, error, request_id_for, require_role
from padel_app.utils.dates import to_utc_iso

bp = Blueprint("admin_api", __name__, url_prefix="/admin/api")

#: Rule 3 / 13: the routes that need no admin token.
OPEN_ENDPOINTS = frozenset({"admin_api.auth_google", "admin_api.auth_config"})


@bp.before_request
def _gate():
    g.request_id = request_id_for(request.headers.get("X-Request-Id"))
    g.admin = None
    g.admin_claims = None
    host = (request.host or "").split(":")[0].strip().lower()
    if host not in tuple(current_app.config.get("ADMIN_HOSTS") or ()):
        return error("NOT_FOUND", 404)
    if request.method == "OPTIONS" or request.endpoint in OPEN_ENDPOINTS:
        return None
    header = request.headers.get("Authorization", "")
    scheme, _, token = header.partition(" ")
    if scheme.lower() != "bearer" or not token.strip():
        return error("ADMIN_TOKEN_REQUIRED", 401)
    try:
        claims = auth_service.decode_admin_token(token.strip())
        role = auth_service.load_role_for_claims(claims)
    except auth_service.AdminTokenInvalid:
        return error("ADMIN_TOKEN_REQUIRED", 401)
    g.admin = role
    g.admin_claims = claims
    return None


@bp.after_request
def _stamp(response):
    rid = g.get("request_id")
    if rid:
        response.headers["X-Request-Id"] = rid
    return response


# ── auth ─────────────────────────────────────────────────────────────────────


@bp.get("/auth/config")
def auth_config():
    return jsonify(auth_service.public_config())


@bp.post("/auth/google")
@audited("auth.sign_in")
def auth_google():
    body = request.get_json(silent=True) or {}
    try:
        token, role, expires_at = auth_service.sign_in(body.get("credential"))
    except auth_service.AdminAuthError as exc:
        g.audit.actor_email = exc.email or "unknown"
        g.audit.after = {"reason": exc.code}
        return error(exc.code, exc.status)
    g.audit.actor_email = role.email
    g.audit.actor_role = role.role
    g.audit.target("admin_role", role.id)
    return jsonify(
        {
            "token": token,
            "expiresAt": to_utc_iso(expires_at.replace(tzinfo=None)),
            "role": role.role,
            "email": role.email,
            "roleId": role.id,
        }
    )


@bp.post("/auth/logout")
@audited("auth.sign_out")
@require_role("support")
def auth_logout():
    auth_service.sign_out(g.admin_claims)
    return jsonify({"ok": True})


@bp.get("/auth/me")
@require_role("support")
def auth_me():
    claims = g.admin_claims
    return jsonify(
        {
            "email": g.admin.email,
            "role": g.admin.role,
            "roleId": g.admin.id,
            "expiresAt": to_utc_iso(__import__("datetime").datetime.utcfromtimestamp(claims["exp"])),
        }
    )


# ── roles ────────────────────────────────────────────────────────────────────


@bp.get("/roles")
@require_role("support")
def list_roles():
    return jsonify({"items": [row.to_dict() for row in role_service.list_roles()]})


def _role_error(exc):
    return error(exc.code, exc.status)


@bp.post("/roles")
@audited("role.grant")
@require_role("owner")
def grant_role():
    body = request.get_json(silent=True) or {}
    try:
        row = role_service.grant(body.get("email"), body.get("role"), g.admin.email)
    except role_service.RoleError as exc:
        return _role_error(exc)
    return jsonify(row.to_dict()), 201


@bp.post("/roles/<int:role_id>")
@audited("role.change")
@require_role("owner")
def change_role(role_id):
    body = request.get_json(silent=True) or {}
    try:
        row = role_service.change(role_id, body.get("role"), g.admin.email)
    except role_service.RoleError as exc:
        return _role_error(exc)
    return jsonify(row.to_dict())


@bp.delete("/roles/<int:role_id>")
@audited("role.revoke")
@require_role("owner")
def revoke_role(role_id):
    try:
        row = role_service.revoke(role_id, g.admin.email)
    except role_service.RoleError as exc:
        return _role_error(exc)
    return jsonify(row.to_dict())


# ── audit ────────────────────────────────────────────────────────────────────


@bp.get("/audit")
@require_role("support")
def list_audit():
    try:
        page = int(request.args.get("page", 1))
    except ValueError:
        page = 1
    rows, has_more = audit_service.search(request.args, page)
    return jsonify({"items": [row.to_dict() for row in rows], "page": page, "hasMore": has_more})


# ── coach approvals (admin.approvals-and-users rules 1–2, PAD-532) ────────────


def _acting_user():
    """The product account linked to the staff member's role, or None (rule 2)."""
    from padel_app.models import User

    return User.query.get(g.admin.user_id) if g.admin.user_id else None


def _coach_snapshot(coach):
    user = coach.user
    return {
        "approvalStatus": coach.approval_status,
        "rejectionReason": coach.rejection_reason,
        "userStatus": user.status if user is not None else None,
    }


@bp.get("/coach-approvals")
@require_role("support")
def list_coach_approvals():
    from padel_app.services.coach_approval_service import list_pending_coaches_service, serialize_pending_coach

    return jsonify({"items": [serialize_pending_coach(c) for c in list_pending_coaches_service()]})


def _decide_coach(coach_id, decide):
    from padel_app.models import Coach

    coach = Coach.query.get(coach_id)
    g.audit.target("coach", coach_id)
    if coach is not None:
        g.audit.before = _coach_snapshot(coach)
    coach = decide()
    g.audit.after = _coach_snapshot(coach)
    return jsonify({"coachId": coach.id, "approvalStatus": coach.approval_status})


@bp.post("/coach-approvals/<int:coach_id>/approve")
@audited("coach.approve")
@require_role("operator")
def approve_coach(coach_id):
    from padel_app.services.coach_approval_service import approve_coach_service

    return _decide_coach(coach_id, lambda: approve_coach_service(coach_id, _acting_user(), defer=g.audit.defer))


@bp.post("/coach-approvals/<int:coach_id>/reject")
@audited("coach.reject")
@require_role("operator")
def reject_coach(coach_id):
    from padel_app.services.coach_approval_service import reject_coach_service

    reason = ((request.get_json(silent=True) or {}).get("reason") or "").strip() or None
    return _decide_coach(
        coach_id, lambda: reject_coach_service(coach_id, _acting_user(), reason=reason, defer=g.audit.defer)
    )


# ── the coach-approval gate (rule 10b; admin.clubs-and-switches rule 4) ───────


@bp.get("/settings/coach-approval")
@require_role("support")
def get_coach_approval_gate():
    from padel_app.services.app_settings_service import admin_settings_payload

    return jsonify(admin_settings_payload())


@bp.put("/settings/coach-approval")
@audited("settings.coach_approval")
@require_role("operator")
def put_coach_approval_gate():
    from padel_app.services.app_settings_service import admin_settings_payload, set_coach_approval_required

    value = (request.get_json(silent=True) or {}).get("coachApprovalRequired")
    if not isinstance(value, bool):
        return error("COACH_APPROVAL_REQUIRED_MUST_BE_BOOLEAN", 400)
    g.audit.target("app_setting", "coach_approval_required")
    g.audit.before = {"coachApprovalRequired": admin_settings_payload()["coachApprovalRequired"]}
    acting = _acting_user()
    set_coach_approval_required(value, updated_by_user_id=acting.id if acting else None, commit=False)
    payload = admin_settings_payload()
    g.audit.after = {"coachApprovalRequired": payload["coachApprovalRequired"]}
    return jsonify(payload)


# ── users (rules 4–7) ─────────────────────────────────────────────────────────


def _users_error(exc):
    return jsonify(exc.payload()), exc.status


@bp.get("/users")
@require_role("support")
def search_users():
    from padel_app.services.admin import users_service

    try:
        items, next_cursor = users_service.search(request.args.get("q"), request.args.get("cursor"))
    except users_service.UsersError as exc:
        return _users_error(exc)
    return jsonify({"items": items, "nextCursor": next_cursor})


@bp.get("/users/<int:user_id>")
@require_role("support")
def view_user(user_id):
    from padel_app.services.admin import users_service

    try:
        return jsonify(users_service.view(user_id))
    except users_service.UsersError as exc:
        return _users_error(exc)


@bp.post("/users/<int:user_id>/disable")
@audited("user.disable")
@require_role("operator")
def disable_user(user_id):
    from padel_app.services.admin import users_service

    try:
        user = users_service.disable(user_id, (request.get_json(silent=True) or {}).get("reason"))
    except users_service.UsersError as exc:
        return _users_error(exc)
    return jsonify(users_service.row(user))


@bp.post("/users/<int:user_id>/enable")
@audited("user.enable")
@require_role("operator")
def enable_user(user_id):
    from padel_app.services.admin import users_service

    try:
        user = users_service.enable(user_id)
    except users_service.UsersError as exc:
        return _users_error(exc)
    return jsonify(users_service.row(user))


@bp.post("/users/<int:user_id>/resend-verification")
@audited("user.resend_verification")
@require_role("operator")
def resend_verification(user_id):
    from padel_app.services.admin import users_service

    try:
        return jsonify(users_service.resend_verification(user_id))
    except users_service.UsersError as exc:
        return _users_error(exc)


# ── view as, read-only (rule 9) ───────────────────────────────────────────────


@bp.post("/users/<int:user_id>/view-as")
@audited("user.view_as")
@require_role("operator", exact=True)  # operators only: not owner, not support (decision 2026-10-07)
def view_as_user(user_id):
    from padel_app.services.admin import users_service, view_as_service

    try:
        return jsonify(view_as_service.mint(user_id, g.admin.email))
    except users_service.UsersError as exc:
        return _users_error(exc)
