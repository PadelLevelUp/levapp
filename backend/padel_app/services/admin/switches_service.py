"""admin.clubs-and-switches rules 5–6 (PAD-533): the capability kill-switch screen."""
from flask import abort, g

from padel_app.sql_db import db

REASON_MIN = 5


def _last_changes():
    """The latest successful ``capability.switch`` per capability, from the audit log."""
    from padel_app.models.admin_audit_log import AdminAuditLog

    rows = (
        AdminAuditLog.query.filter_by(action="capability.switch", outcome="ok")
        .order_by(AdminAuditLog.id.desc())
        .all()
    )
    latest = {}
    for row in rows:
        latest.setdefault(row.target_id, row)
    return latest


def list_capabilities():
    from padel_app.services.app_settings_service import capability_kill_switches
    from padel_app.utils.client_capabilities import CAPABILITIES
    from padel_app.utils.dates import to_utc_iso

    switches = capability_kill_switches()
    changes = _last_changes()
    items = []
    for name, kind in CAPABILITIES.items():
        entry = switches.get(name) or {}
        change = changes.get(name)
        items.append({
            "capability": name,
            "kind": kind,
            "off": bool(entry.get("off")),
            "reason": entry.get("reason"),
            "changedAt": to_utc_iso(change.created_at) if change else None,
            "changedBy": change.actor_email if change else None,
        })
    return {"items": items}


def set_switch(capability, data):
    from padel_app.services.app_settings_service import set_capability_switch
    from padel_app.utils.client_capabilities import CAPABILITIES

    name = (capability or "").lower()
    if name not in CAPABILITIES:
        abort(404)
    data = data or {}
    off = data.get("off")
    if not isinstance(off, bool):
        return None, "OFF_MUST_BE_BOOLEAN"
    reason = data.get("reason")
    reason = reason.strip() if isinstance(reason, str) else None
    if off and (not reason or len(reason) < REASON_MIN):
        return None, "REASON_REQUIRED"
    admin = getattr(g, "admin", None)
    change = set_capability_switch(name, off, reason, updated_by_user_id=getattr(admin, "user_id", None))
    g.audit.target("capability", name)
    g.audit.before, g.audit.after = change["before"], change["after"]
    return list_capabilities(), None
