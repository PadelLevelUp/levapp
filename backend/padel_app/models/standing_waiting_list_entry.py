
from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, Index, text
from sqlalchemy.orm import relationship

from padel_app import model
from padel_app.sql_db import db
from padel_app.utils.dates import utcnow_naive


class StandingWaitingListEntry(db.Model, model.Model):
    __tablename__ = "standing_waiting_list_entries"
    # PAD-273 (audit M14): uniqueness the domain implies, enforced by the database.
    __table_args__ = (
        # PAD-547 (rule 19): one active entry per coach, player AND scope — coach-wide (NULL
        # lesson_id) or one per series.
        Index(
            "uq_standing_entries_active_coach_player_scope",
            "coach_id",
            "player_id",
            text("COALESCE(lesson_id, 0)"),
            unique=True,
            postgresql_where=text("is_active"),
            sqlite_where=text("is_active"),
        ),
        {"extend_existing": True},
    )

    page_title = "Standing Waiting List Entry"
    model_name = "StandingWaitingListEntry"

    id = Column(Integer, primary_key=True)
    coach_id = Column(
        Integer, ForeignKey("coaches.id", ondelete="CASCADE"), nullable=False
    )
    player_id = Column(
        Integer, ForeignKey("players.id", ondelete="CASCADE"), nullable=False
    )
    # PAD-547 (notifications.waiting-list rule 19): an entry scoped to one series fans out only to
    # that series' occurrences; NULL is the coach-wide reach of rule 3a.
    lesson_id = Column(Integer, ForeignKey("lessons.id", ondelete="CASCADE"), nullable=True)
    credits_total = Column(Integer, nullable=False)
    credits_used = Column(Integer, default=0, nullable=False)
    expires_at = Column(DateTime, nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=lambda: utcnow_naive())

    coach = relationship("Coach")
    player = relationship("Player")
    lesson = relationship("Lesson")

    @property
    def name(self):
        return f"StandingWaitingListEntry #{self.id}"
