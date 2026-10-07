"""admin.foundation rules 5, 8 and 10 (PAD-531): the role matrix and the audit wrapper.

    @bp.post("/roles")
    @audited("role.grant")        # outermost: records denied / ok / error, commits once
    @require_role("owner")        # answers 403 ADMIN_ROLE_TOO_LOW below the role
    def grant_role(): ...

`audited` is the only place that commits under /admin/api: the write and its audit row share
one transaction (rule 8). A 4xx other than 401/403, a 5xx or an exception rolls the write back
and records `outcome = error` on its own; 401/403 record `denied`.
"""
import functools
import logging
import re
import uuid

from flask import current_app, g, jsonify, request

from padel_app.models.admin_role import ROLE_ORDER
from padel_app.sql_db import db

logger = logging.getLogger(__name__)

REQUEST_ID_RE = re.compile(r"^[A-Za-z0-9-]{8,64}$")


def request_id_for(incoming):
    """Rule 10: keep a well-formed incoming X-Request-Id, otherwise mint a UUID4."""
    value = (incoming or "").strip()
    return value if REQUEST_ID_RE.match(value) else str(uuid.uuid4())


def error(code, status):
    return jsonify({"error": code}), status


class AuditContext:
    """What one audited request will record. Services fill target/before/after."""

    def __init__(self, action):
        self.action = action
        self.target_type = None
        self.target_id = None
        self.before = None
        self.after = None
        self.actor_email = None
        self.actor_role = None

    def target(self, target_type, target_id):
        self.target_type = target_type
        self.target_id = target_id

    def resolve_actor(self):
        admin = getattr(g, "admin", None)
        if admin is not None:
            self.actor_email = self.actor_email or admin.email
            self.actor_role = self.actor_role or admin.role


def role_at_least(role, minimum):
    return ROLE_ORDER.index(role) >= ROLE_ORDER.index(minimum)


def require_role(minimum, *, exact=False):
    """Rule 5. ``exact=True`` is the one exception to the order (view-as, operator only)."""
    if minimum not in ROLE_ORDER:
        raise ValueError(f"unknown admin role {minimum!r}")

    def decorator(view):
        @functools.wraps(view)
        def wrapper(*args, **kwargs):
            admin = getattr(g, "admin", None)
            if admin is None:
                return error("ADMIN_TOKEN_REQUIRED", 401)
            allowed = admin.role == minimum if exact else role_at_least(admin.role, minimum)
            if not allowed:
                return error("ADMIN_ROLE_TOO_LOW", 403)
            return view(*args, **kwargs)

        wrapper._admin_min_role = minimum
        wrapper._admin_exact_role = exact
        return wrapper

    return decorator


def _outcome_for(status):
    if status < 300:
        return "ok"
    if status in (401, 403):
        return "denied"
    return "error"


def _record(ctx, outcome):
    from padel_app.services.admin import audit_service

    ctx.resolve_actor()
    return audit_service.record(ctx, outcome, g.get("request_id") or str(uuid.uuid4()))


def audited(action):
    """Rule 8: every non-GET view of the admin blueprint carries this marker and this behaviour."""

    def decorator(view):
        @functools.wraps(view)
        def wrapper(*args, **kwargs):
            ctx = AuditContext(action)
            g.audit = ctx
            try:
                response = current_app.make_response(view(*args, **kwargs))
            except Exception:
                db.session.rollback()
                _record_alone(ctx, "error")
                raise
            outcome = _outcome_for(response.status_code)
            if outcome == "ok":
                try:
                    _record(ctx, outcome)
                    db.session.commit()
                except Exception:
                    # The write and its row go together: neither survives (rule 8).
                    db.session.rollback()
                    raise
            else:
                db.session.rollback()
                _record_alone(ctx, outcome)
            return response

        wrapper.__audited_action__ = action
        return wrapper

    return decorator


def _record_alone(ctx, outcome):
    """A denied/error row in its own transaction; a failure here is logged, never raised."""
    try:
        _record(ctx, outcome)
        db.session.commit()
    except Exception:
        db.session.rollback()
        logger.exception("admin audit row for %s (%s) could not be written", ctx.action, outcome)
