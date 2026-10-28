"""notifications.config rule 16 (PAD-771): one row per recorded key a configuration save changed, with
its value before and after, so a past invitation round can be replayed against the configuration it
ran under. Written in the save's own commit by `update_config`, never edited. The keys are rules and
timings (`RECORDED_CONFIG_KEYS`), never a student id or name.

A table, not a log line: container logs do not survive a redeploy.
"""
from sqlalchemy import JSON, Column, DateTime, ForeignKey, Index, Integer, String

from padel_app.sql_db import db
from padel_app.utils.dates import utcnow_naive


class NotificationConfigChange(db.Model):
    __tablename__ = "notification_config_changes"
    __table_args__ = (
        Index("ix_notification_config_changes_coach_id_changed_at", "coach_id", "changed_at"),
        {"extend_existing": True},
    )

    id = Column(Integer, primary_key=True)
    created_at = Column(DateTime, nullable=False, default=lambda: utcnow_naive())
    updated_at = Column(
        DateTime, nullable=False, default=lambda: utcnow_naive(), onupdate=lambda: utcnow_naive()
    )
    coach_id = Column(Integer, ForeignKey("coaches.id", ondelete="CASCADE"), nullable=False)
    changed_at = Column(DateTime, nullable=False, default=lambda: utcnow_naive())
    key = Column(String(32), nullable=False)
    before = Column(JSON, nullable=True)
    after = Column(JSON, nullable=True)
