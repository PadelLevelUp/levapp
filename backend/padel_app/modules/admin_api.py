"""admin.foundation (PAD-531): the staff console's API, `/admin/api/*`.

Registered in every environment; `before_request` answers 404 on any host outside ADMIN_HOSTS
(rule 11), stamps a request id (rule 10) and, except on the two unauthenticated routes, verifies
the admin token and loads the role row (rules 3–4). Handlers stay thin (R-005); responses are
camelCase (R-022); times are UTC ISO (R-023).
"""
from flask import Blueprint, current_app, g, jsonify, request

from padel_app.services.admin import audit_service, auth_service, role_service
from padel_app.utils.admin_auth import audited, error, request_id_for, require_role
from padel_app.utils.rate_limit import rate_limited
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
@rate_limited("admin_sign_in")
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


# ── clubs and switches (PAD-533, admin.clubs-and-switches rules 1–3, 5, 6) ────────────────────

def _court_error(exc):
    # Rule 2: the coach route's own answer (clubs.courts).
    return jsonify({"error": str(exc), "code": exc.code}), 400


@bp.get("/clubs")
@require_role("support")
def admin_list_clubs():
    from padel_app.services.admin import clubs_service

    return jsonify(clubs_service.list_clubs(request.args.get("q"), request.args.get("page", 1)))


@bp.get("/clubs/<int:club_id>")
@require_role("support")
def admin_club_detail(club_id):
    from padel_app.services.admin import clubs_service

    return jsonify(clubs_service.club_detail(club_id))


@bp.patch("/clubs/<int:club_id>")
@audited("club.edit")
@require_role("operator")
def admin_edit_club(club_id):
    from padel_app.services.admin import clubs_service

    try:
        return jsonify(clubs_service.edit_club(club_id, request.get_json(silent=True) or {}))
    except clubs_service.ClubFieldError as exc:
        return jsonify({"error": str(exc), "code": "invalid_club"}), 400


@bp.post("/clubs/<int:club_id>/courts")
@audited("court.create")
@require_role("operator")
def admin_add_court(club_id):
    from padel_app.services.admin import clubs_service
    from padel_app.services.court_service import InvalidCourtError, serialize_court

    try:
        court = clubs_service.add_court(club_id, request.get_json(silent=True) or {})
    except InvalidCourtError as exc:
        return _court_error(exc)
    return jsonify(serialize_court(court)), 201


@bp.patch("/courts/<int:court_id>")
@audited("court.rename")
@require_role("operator")
def admin_rename_court(court_id):
    from padel_app.services.admin import clubs_service
    from padel_app.services.court_service import InvalidCourtError, serialize_court

    try:
        court = clubs_service.rename_court(court_id, request.get_json(silent=True) or {})
    except InvalidCourtError as exc:
        return _court_error(exc)
    return jsonify(serialize_court(court))


@bp.delete("/courts/<int:court_id>")
@audited("court.delete")
@require_role("operator")
def admin_delete_court(court_id):
    from padel_app.services.admin import clubs_service

    return jsonify(clubs_service.delete_court(court_id))


@bp.put("/clubs/<int:club_id>/courts/order")
@audited("court.reorder")
@require_role("operator")
def admin_reorder_courts(club_id):
    from padel_app.services.admin import clubs_service
    from padel_app.services.court_service import InvalidCourtError

    try:
        return jsonify(clubs_service.reorder_courts(club_id, (request.get_json(silent=True) or {}).get("ids")))
    except InvalidCourtError as exc:
        return _court_error(exc)


@bp.post("/clubs/<int:club_id>/coaches")
@audited("club.coach_link")
@require_role("operator")
def admin_link_coach(club_id):
    from padel_app.services.admin import clubs_service

    return jsonify(clubs_service.link_coach(club_id, (request.get_json(silent=True) or {}).get("coachId")))


@bp.delete("/clubs/<int:club_id>/coaches/<int:coach_id>")
@audited("club.coach_unlink")
@require_role("operator")
def admin_unlink_coach(club_id, coach_id):
    from padel_app.services.admin import clubs_service

    return jsonify(clubs_service.unlink_coach(club_id, coach_id))


@bp.get("/settings/capabilities")
@require_role("support")
def admin_list_capabilities():
    from padel_app.services.admin import switches_service

    return jsonify(switches_service.list_capabilities())


@bp.put("/settings/capabilities/<capability>")
@audited("capability.switch")
@require_role("owner")
def admin_set_capability(capability):
    """Rule 6: owner only (decision 2026-10-07); a reason of at least 5 characters to switch off."""
    from padel_app.services.admin import switches_service

    body, problem = switches_service.set_switch(capability, request.get_json(silent=True) or {})
    if problem:
        return error(problem, 400)
    return jsonify(body)
