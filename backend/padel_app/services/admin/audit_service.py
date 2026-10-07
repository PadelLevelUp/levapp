"""admin.foundation rules 8–10 (PAD-531): write and read audit rows."""
from datetime import datetime

from padel_app.models.admin_audit_log import AdminAuditLog
from padel_app.sql_db import db

PAGE_SIZE = 50


def record(ctx, outcome, request_id):
    """Add one row for ``ctx`` (an AuditContext) to the session. Does not commit."""
    row = AdminAuditLog(
        actor_email=(ctx.actor_email or "unknown")[:254],
        actor_role=ctx.actor_role,
        action=ctx.action,
        target_type=ctx.target_type,
        target_id=None if ctx.target_id is None else str(ctx.target_id)[:64],
        before=ctx.before,
        after=ctx.after,
        request_id=request_id,
        outcome=outcome,
    )
    db.session.add(row)
    db.session.flush()
    return row


def _parse_dt(value):
    if not value:
        return None
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00")).replace(tzinfo=None)
    except ValueError:
        return None


def search(filters, page=1):
    """Rule 9: newest first, filtered, 50 per page. Returns ``(rows, has_more)``."""
    q = AdminAuditLog.query
    if filters.get("actorEmail"):
        q = q.filter(AdminAuditLog.actor_email == filters["actorEmail"].strip().lower())
    if filters.get("action"):
        q = q.filter(AdminAuditLog.action == filters["action"].strip())
    if filters.get("targetType"):
        q = q.filter(AdminAuditLog.target_type == filters["targetType"].strip())
    if filters.get("targetId"):
        q = q.filter(AdminAuditLog.target_id == str(filters["targetId"]).strip())
    since = _parse_dt(filters.get("from"))
    until = _parse_dt(filters.get("to"))
    if since is not None:
        q = q.filter(AdminAuditLog.created_at >= since)
    if until is not None:
        q = q.filter(AdminAuditLog.created_at <= until)
    page = max(int(page or 1), 1)
    rows = (
        q.order_by(AdminAuditLog.created_at.desc(), AdminAuditLog.id.desc())
        .offset((page - 1) * PAGE_SIZE)
        .limit(PAGE_SIZE + 1)
        .all()
    )
    return rows[:PAGE_SIZE], len(rows) > PAGE_SIZE
