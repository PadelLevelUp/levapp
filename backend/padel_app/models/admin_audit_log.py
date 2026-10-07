"""admin.foundation (PAD-531): one append-only row per console write.

Rule 8: the row is inserted in the request's transaction by `@audited` (utils/admin_auth.py), so
the write and its record commit or roll back together. Rule 9: no route updates or deletes a row,
and the ORM refuses an update or delete in `before_flush`.
"""
from sqlalchemy import JSON, Column, DateTime, Index, Integer, String, event
from sqlalchemy.orm import Session

from padel_app.sql_db import db
from padel_app.utils.dates import utcnow_naive

OUTCOMES = ("ok", "denied", "error")


class AdminAuditLogImmutable(RuntimeError):
    """Raised when a session tries to change or delete an audit row."""


class AdminAuditLog(db.Model):
    __tablename__ = "admin_audit_log"
    __table_args__ = (
        Index("ix_admin_audit_log_target", "target_type", "target_id"),
        {"extend_existing": True},
    )

    id = Column(Integer, primary_key=True)
    created_at = Column(DateTime, nullable=False, default=lambda: utcnow_naive(), index=True)
    actor_email = Column(String(254), nullable=False, index=True)
    actor_role = Column(String(16), nullable=True)
    action = Column(String(64), nullable=False, index=True)
    target_type = Column(String(64), nullable=True)
    target_id = Column(String(64), nullable=True)
    before = Column(JSON, nullable=True)
    after = Column(JSON, nullable=True)
    request_id = Column(String(64), nullable=False)
    outcome = Column(String(16), nullable=False)
    # The editor mixin's pair, kept so the table matches every other one (memory:
    # new-table migrations need updated_at). Never changes: the row is immutable.
    updated_at = Column(DateTime, nullable=False, default=lambda: utcnow_naive())

    def to_dict(self):
        from padel_app.utils.dates import to_utc_iso

        return {
            "id": self.id,
            "createdAt": to_utc_iso(self.created_at),
            "actorEmail": self.actor_email,
            "actorRole": self.actor_role,
            "action": self.action,
            "targetType": self.target_type,
            "targetId": self.target_id,
            "before": self.before,
            "after": self.after,
            "requestId": self.request_id,
            "outcome": self.outcome,
        }


@event.listens_for(Session, "before_flush")
def _audit_rows_are_append_only(session, flush_context, instances):
    """Rule 9: an audit row, once inserted, can neither change nor disappear through the ORM."""
    for obj in list(session.dirty):
        if isinstance(obj, AdminAuditLog) and session.is_modified(obj, include_collections=False):
            raise AdminAuditLogImmutable("admin_audit_log rows are append-only (admin.foundation rule 9)")
    for obj in list(session.deleted):
        if isinstance(obj, AdminAuditLog):
            raise AdminAuditLogImmutable("admin_audit_log rows cannot be deleted (admin.foundation rule 9)")
