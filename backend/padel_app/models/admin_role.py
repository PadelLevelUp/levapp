"""admin.foundation (PAD-531): who may use the staff console, and as what.

One row per staff email. A row is active while `revoked_at` is null. `email` is unique, so
re-granting a revoked email re-activates its row (spec note). `user_id` is the product account
with the same email when one exists; attribution never depends on it (the audit row names the
email). Replaces the legacy superadmin flag on `users` for new code (rule 6); that column is not
dropped.
"""
from sqlalchemy import Column, DateTime, ForeignKey, Integer, String

from padel_app.sql_db import db
from padel_app.utils.dates import utcnow_naive

ROLE_ORDER = ("support", "operator", "owner")


class AdminRole(db.Model):
    __tablename__ = "admin_roles"
    __table_args__ = {"extend_existing": True}

    id = Column(Integer, primary_key=True)
    email = Column(String(254), nullable=False, unique=True, index=True)
    role = Column(String(16), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    granted_by_email = Column(String(254), nullable=True)
    granted_at = Column(DateTime, nullable=False, default=lambda: utcnow_naive())
    revoked_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, nullable=False, default=lambda: utcnow_naive())
    updated_at = Column(
        DateTime, nullable=False, default=lambda: utcnow_naive(), onupdate=lambda: utcnow_naive()
    )

    @property
    def active(self):
        return self.revoked_at is None

    @classmethod
    def active_by_email(cls, email):
        return cls.query.filter_by(email=(email or "").strip().lower(), revoked_at=None).first()

    def to_dict(self):
        from padel_app.utils.dates import to_utc_iso

        return {
            "id": self.id,
            "email": self.email,
            "role": self.role,
            "userId": self.user_id,
            "grantedByEmail": self.granted_by_email,
            "grantedAt": to_utc_iso(self.granted_at),
            "revokedAt": to_utc_iso(self.revoked_at),
            "active": self.active,
        }
