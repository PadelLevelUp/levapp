"""messaging.push-notifications rule 10a (PAD-699): one row per push to send, drained by the
scheduler leader with FOR UPDATE SKIP LOCKED.

A row holds WHAT to say, never WHERE: channel, user and the message (title, body, data or url,
badge). The device tokens, the web-push subscription and the VAPID key are looked up when the row
is sent, so no capability URL or key is stored, and a device unregistered meanwhile is not sent to.
The message is nulled once the row is terminal (sent, skipped, dead). Sent and skipped rows go after
24 h and dead ones after 30 days (admin.data-retention).

status: pending → sending (claimed, `claimed_by`/`claimed_at`; a lease of 60 s) → sent | skipped |
pending (retry, `due_at` backed off) | dead (after the last attempt).
"""
from sqlalchemy import JSON, Column, DateTime, ForeignKey, Index, Integer, String

from padel_app.sql_db import db
from padel_app.utils.dates import utcnow_naive

CHANNELS = ("expo", "webpush")
STATUSES = ("pending", "sending", "sent", "skipped", "dead")


class PushOutbox(db.Model):
    __tablename__ = "push_outbox"
    __table_args__ = (
        Index("ix_push_outbox_status_due_at", "status", "due_at"),
        {"extend_existing": True},
    )

    id = Column(Integer, primary_key=True)
    created_at = Column(DateTime, nullable=False, default=lambda: utcnow_naive())
    updated_at = Column(
        DateTime, nullable=False, default=lambda: utcnow_naive(), onupdate=lambda: utcnow_naive()
    )
    due_at = Column(DateTime, nullable=False, default=lambda: utcnow_naive())
    channel = Column(String(16), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    payload = Column(JSON, nullable=True)
    status = Column(String(16), nullable=False, default="pending")
    attempts = Column(Integer, nullable=False, default=0)
    claimed_by = Column(String(64), nullable=True)
    claimed_at = Column(DateTime, nullable=True)
    last_error = Column(String(120), nullable=True)
    sent_at = Column(DateTime, nullable=True)
