"""admin.engine-health (PAD-534): one row per send the platform failed to make, or a reminder it
skipped because its time had passed. Kept 30 days (`prune_delivery_incidents`). Holds no recipient
address, message body, device token or push key: the user id, what it was about, and the error's
class with a truncated, address-free detail."""
from sqlalchemy import Column, DateTime, ForeignKey, Integer, String

from padel_app.sql_db import db
from padel_app.utils.dates import utcnow_naive

KINDS = ("email_failed", "push_failed", "reminder_skipped_past_due")
CHANNELS = ("email", "webpush", "apns", "fcm", "expo", "scheduler")


class DeliveryIncident(db.Model):
    __tablename__ = "delivery_incidents"
    __table_args__ = {"extend_existing": True}

    id = Column(Integer, primary_key=True)
    created_at = Column(DateTime, nullable=False, default=lambda: utcnow_naive(), index=True)
    updated_at = Column(
        DateTime, nullable=False, default=lambda: utcnow_naive(), onupdate=lambda: utcnow_naive()
    )
    kind = Column(String(32), nullable=False, index=True)
    channel = Column(String(16), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    subject_type = Column(String(32), nullable=True)
    subject_id = Column(Integer, nullable=True)
    error_class = Column(String(120), nullable=True)
    detail = Column(String(500), nullable=True)

    def to_dict(self):
        from padel_app.utils.dates import to_utc_iso

        return {
            "id": self.id,
            "createdAt": to_utc_iso(self.created_at),
            "kind": self.kind,
            "channel": self.channel,
            "userId": self.user_id,
            "subjectType": self.subject_type,
            "subjectId": self.subject_id,
            "errorClass": self.error_class,
            "detail": self.detail,
        }
