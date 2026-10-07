"""admin.foundation rules 5–7 (PAD-531): grant, change and revoke console roles.

Nothing here commits: the route's `@audited` wrapper commits the change and its audit row in
one transaction (rule 8). Each function fills the audit context's target/before/after.
"""
from flask import g

from padel_app.models import User
from padel_app.models.admin_role import ROLE_ORDER, AdminRole
from padel_app.sql_db import db
from padel_app.utils.dates import utcnow_naive


class RoleError(Exception):
    status = 400
    code = "ROLE_ERROR"


class InvalidRole(RoleError):
    code = "INVALID_ROLE"


class NotStaffDomain(RoleError):
    code = "NOT_STAFF_DOMAIN"


class RoleExists(RoleError):
    status = 409
    code = "ROLE_EXISTS"


class LastOwner(RoleError):
    status = 409
    code = "LAST_OWNER"


class RoleNotFound(RoleError):
    status = 404
    code = "ROLE_NOT_FOUND"


def _audit(target_id, before, after):
    ctx = getattr(g, "audit", None)
    if ctx is not None:
        ctx.target("admin_role", target_id)
        ctx.before = before
        ctx.after = after


def _snapshot(row):
    return {"email": row.email, "role": row.role} if row is not None and row.revoked_at is None else None


def _staff_email(email):
    email = (email or "").strip().lower()
    from padel_app.services.admin.auth_service import staff_domain

    domain = staff_domain()
    if not email or "@" not in email or not email.endswith("@" + domain):
        raise NotStaffDomain()
    return email


def _check_role(role):
    if role not in ROLE_ORDER:
        raise InvalidRole()
    return role


def _owner_rows_for_update():
    """The active owner rows, locked until the transaction ends (Postgres `FOR UPDATE`; SQLite
    has no row locks and serialises writers anyway). Two owners revoking each other at once both
    wait here, and the second sees the first's revoke: there is always an owner (rule 7)."""
    return AdminRole.query.filter_by(role="owner", revoked_at=None).order_by(AdminRole.id).with_for_update().all()


def _would_remove_last_owner(row, new_role):
    if row.role != "owner" or row.revoked_at is not None or new_role == "owner":
        return False
    return len(_owner_rows_for_update()) <= 1


def list_roles():
    return AdminRole.query.order_by(AdminRole.revoked_at.isnot(None), AdminRole.email).all()


def grant(email, role, actor_email):
    """Rule 7: company domain only; a revoked email's row is re-activated (email is unique)."""
    email = _staff_email(email)
    role = _check_role(role)
    row = AdminRole.query.filter_by(email=email).first()
    before = _snapshot(row)
    if row is not None and row.revoked_at is None:
        raise RoleExists()
    now = utcnow_naive()
    user = User.query.filter(db.func.lower(User.email) == email).first()
    if row is None:
        row = AdminRole(email=email)
        db.session.add(row)
    row.role = role
    row.user_id = user.id if user else None
    row.granted_by_email = actor_email
    row.granted_at = now
    row.revoked_at = None
    db.session.flush()
    _audit(row.id, before, _snapshot(row))
    return row


def change(role_id, new_role, actor_email):
    row = AdminRole.query.get(role_id)
    if row is None or row.revoked_at is not None:
        raise RoleNotFound()
    new_role = _check_role(new_role)
    before = _snapshot(row)
    if _would_remove_last_owner(row, new_role):
        _audit(row.id, before, before)
        raise LastOwner()
    row.role = new_role
    row.granted_by_email = actor_email
    row.granted_at = utcnow_naive()
    db.session.flush()
    _audit(row.id, before, _snapshot(row))
    return row


def revoke(role_id, actor_email):
    row = AdminRole.query.get(role_id)
    if row is None or row.revoked_at is not None:
        raise RoleNotFound()
    before = _snapshot(row)
    if _would_remove_last_owner(row, None):
        _audit(row.id, before, before)
        raise LastOwner()
    row.revoked_at = utcnow_naive()
    db.session.flush()
    _audit(row.id, before, None)
    return row
