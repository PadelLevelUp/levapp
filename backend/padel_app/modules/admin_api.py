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
    # admin.engine-health rule 5 (PAD-534): the other environment's console reads this one's deploy
    # identity with a peer token instead of an admin session. That endpoint only; GET only.
    g.peer = False
    if (scheme.lower() == "peer" and request.endpoint == "admin_api.deploy_identity"
            and request.method == "GET" and _peer_token_ok(token.strip())):
        g.peer = True
        # Visible like every other admin read (#PAD-534 review): a log line naming the peer.
        current_app.logger.info("admin peer read: %s %s request_id=%s", request.method, request.path,
                                g.request_id)
        return None
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


def _peer_token_ok(token: str) -> bool:
    import hmac

    expected = current_app.config.get("ADMIN_PEER_INBOUND_TOKEN") or ""
    return bool(expected) and bool(token) and hmac.compare_digest(token, expected)


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


# ── engine health (PAD-534, admin.engine-health): read-only, support ─────────────────────────


@bp.get("/engine-health")
@require_role("support")
def engine_health():
    from padel_app.services.admin import engine_health as svc

    return jsonify(svc.summary(current_app.config))


@bp.get("/engine-health/coaches")
@require_role("support")
def engine_health_coaches():
    from padel_app.services.admin import engine_health as svc

    return jsonify({"coaches": svc.coaches(request.args.get("q"))})


@bp.get("/engine-health/coaches/<int:coach_id>")
@require_role("support")
def engine_health_coach(coach_id):
    from padel_app.services.admin import engine_health as svc

    detail = svc.coach_detail(coach_id)
    if detail is None:
        return error("NOT_FOUND", 404)
    return jsonify(detail)


@bp.get("/deploy-identity")
def deploy_identity():
    """Rule 5: this environment's commit and migration head — for a support session, or for the
    other environment's console presenting the peer token (`Authorization: Peer <token>`)."""
    from padel_app.services.admin import engine_health as svc
    from padel_app.utils.admin_auth import role_at_least

    if not g.get("peer"):
        if g.admin is None:
            return error("ADMIN_TOKEN_REQUIRED", 401)
        if not role_at_least(g.admin.role, "support"):
            return error("ADMIN_ROLE_TOO_LOW", 403)
    return jsonify(svc.this_identity())
