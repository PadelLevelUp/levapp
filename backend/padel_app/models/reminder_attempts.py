"""notifications.reminders rule 14 (PAD-207, audit M6): one row per reminder
sent — the source of truth for "how many", "which is pending" and "which to
mark answered". The reminder message stays the delivery record the clients
render; its `msg_metadata` is written in step with this row."""
from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Index, Integer, String
from sqlalchemy.orm import relationship

from padel_app.sql_db import db
from padel_app import model


class ReminderAttempt(db.Model, model.Model):
    __tablename__ = "reminder_attempts"
    __table_args__ = (
        Index("ix_reminder_attempts_instance_player", "lesson_instance_id", "player_id"),
        {"extend_existing": True},
    )

    page_title = "Reminder attempts"
    model_name = "ReminderAttempt"

    id = Column(Integer, primary_key=True)
    lesson_instance_id = Column(Integer, ForeignKey("lesson_instances.id", ondelete="CASCADE"), nullable=False)
    player_id = Column(Integer, ForeignKey("players.id", ondelete="CASCADE"), nullable=False)
    presence_id = Column(Integer, ForeignKey("presences.id", ondelete="SET NULL"), nullable=True)
    number = Column(Integer, nullable=False, default=1)
    message_id = Column(Integer, ForeignKey("messages.id", ondelete="SET NULL"), nullable=True)
    sent_at = Column(DateTime, nullable=True)
    responded_at = Column(DateTime, nullable=True)
    response = Column(String(20), nullable=True)
    superseded = Column(Boolean, nullable=False, default=False, server_default="0")
    expired = Column(Boolean, nullable=False, default=False, server_default="0")

    message = relationship("Message", foreign_keys=[message_id])

    @property
    def pending(self) -> bool:
        return self.responded_at is None and not self.superseded

    def __repr__(self):
        return f"<ReminderAttempt instance={self.lesson_instance_id} player={self.player_id} #{self.number}>"
