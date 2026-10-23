"""messaging.push-notifications rule 10b (PAD-745): one row per Expo ticket answered `ok`, so the
receipt Apple or Google gave it can be read later from `/push/getReceipts`.

status: pending (ticket kept) → ok | error (`error_code` names Expo's code) | expired (no receipt
within the 24 h Expo keeps them). Kept 30 days, pruned with the delivery incidents. The token is
kept to retire it on a DeviceNotRegistered receipt; logs only ever show its tail (B-254).
"""
from sqlalchemy import Column, DateTime, ForeignKey, Index, Integer, String, UniqueConstraint

from padel_app.sql_db import db
from padel_app.utils.dates import utcnow_naive

STATUSES = ("pending", "ok", "error", "expired")


class PushReceipt(db.Model):
    __tablename__ = "push_receipt"
    __table_args__ = (
        UniqueConstraint("ticket_id", name="uq_push_receipt_ticket_id"),
        Index("ix_push_receipt_status_sent_at", "status", "sent_at"),
        {"extend_existing": True},
    )

    id = Column(Integer, primary_key=True)
    created_at = Column(DateTime, nullable=False, default=lambda: utcnow_naive())
    updated_at = Column(
        DateTime, nullable=False, default=lambda: utcnow_naive(), onupdate=lambda: utcnow_naive()
    )
    ticket_id = Column(String(64), nullable=False)
    token = Column(String(255), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    outbox_id = Column(Integer, nullable=True)
    sent_at = Column(DateTime, nullable=False, default=lambda: utcnow_naive(), index=True)
    status = Column(String(16), nullable=False, default="pending")
    error_code = Column(String(64), nullable=True)
    checked_at = Column(DateTime, nullable=True)
