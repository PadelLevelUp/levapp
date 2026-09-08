"""A coach's "later" on one item of the dashboard's needs-you queue.

Plain ``db.Model`` on purpose (like ``TokenBlocklist``): this is dashboard
plumbing, not something the generic admin editor should ever expose, so it is
deliberately absent from ``models.MODELS``.
"""
from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, UniqueConstraint

from padel_app.sql_db import db
from padel_app.utils.dates import utcnow_naive


class NeedsYouSnooze(db.Model):
    __tablename__ = "needs_you_snoozes"
    __table_args__ = (
        UniqueConstraint("coach_id", "item_id", name="uq_needs_you_snooze_coach_item"),
        {"extend_existing": True},
    )

    id = Column(Integer, primary_key=True)
    coach_id = Column(
        Integer, ForeignKey("coaches.id", ondelete="CASCADE"), nullable=False, index=True
    )
    # The queue item's own `id` — `lessoninstance-<pk>` for a materialized
    # occurrence, `lesson-<pk>-<date>` for a virtual one. A string, because the
    # queue is keyed by occurrence, not by a single table's primary key.
    item_id = Column(String(64), nullable=False)
    # Naive UTC, like every other datetime in the schema.
    snoozed_until = Column(DateTime, nullable=False)
    created_at = Column(DateTime, nullable=False, default=utcnow_naive)
