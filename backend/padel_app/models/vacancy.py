from datetime import datetime

from sqlalchemy import Column, DateTime, Enum, ForeignKey, Index, Integer, text
from sqlalchemy.orm import relationship

from padel_app import model
from padel_app.sql_db import db


class Vacancy(db.Model, model.Model):
    __tablename__ = "vacancies"
    # PAD-263: vacancies per class, and a partial index for the engine's
    # open-vacancy sweep (filled and expired rows are never read by it).
    __table_args__ = (
        Index("ix_vacancies_lesson_instance_id_status", "lesson_instance_id", "status"),
        Index(
            "ix_vacancies_open",
            "status",
            postgresql_where=text("status = 'open'"),
            sqlite_where=text("status = 'open'"),
        ),
        # PAD-303 (B-046 step 5 / B-051; notifications.invitations rule 13): one
        # OPEN vacancy per departing player per occurrence. Filled/expired rows and
        # structural vacancies (no departing player) are outside the predicate.
        Index(
            "uq_vacancies_open_original_player",
            "lesson_instance_id",
            "original_player_id",
            unique=True,
            postgresql_where=text("status = 'open' AND original_player_id IS NOT NULL"),
            sqlite_where=text("status = 'open' AND original_player_id IS NOT NULL"),
        ),
        {"extend_existing": True},
    )

    page_title = "Vacancy"
    model_name = "Vacancy"

    id = Column(Integer, primary_key=True)

    lesson_instance_id = Column(
        Integer, ForeignKey("lesson_instances.id", ondelete="CASCADE"), nullable=False
    )
    coach_id = Column(
        Integer, ForeignKey("coaches.id", ondelete="CASCADE"), nullable=False
    )
    # The player who vacated the spot (None for structurally open spots)
    original_player_id = Column(
        Integer, ForeignKey("players.id", ondelete="SET NULL"), nullable=True
    )
    # Snapshotted from the departing player's Association_CoachPlayer at creation time
    side = Column(Enum("left", "right", "both", name="vacancy_side"), nullable=True)
    level_id = Column(Integer, ForeignKey("coach_levels.id", ondelete="SET NULL"), nullable=True)  # PAD-255

    status = Column(
        Enum("open", "filled", "expired", name="vacancy_status"),
        default="open",
        nullable=False,
    )
    # Semi-automatic mode: "pending" until the coach approves/dismisses.
    # Automatic mode always uses "not_required".
    approval_status = Column(
        Enum("not_required", "pending", "approved", "dismissed", name="vacancy_approval_status"),
        default="not_required",
        server_default="not_required",
        nullable=False,
    )
    # Set when the coach approves "at the invitation window" before it opens:
    # no invitations may be sent for this vacancy before this datetime.
    invite_not_before = Column(DateTime, nullable=True)
    current_round_number = Column(Integer, default=1, nullable=False)
    current_batch_number = Column(Integer, default=0, nullable=False)

    filled_by_player_id = Column(
        Integer, ForeignKey("players.id", ondelete="SET NULL"), nullable=True
    )
    # Updated on every send or response; used to determine maxInactiveTime
    last_activity_at = Column(DateTime, nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow)
    filled_at = Column(DateTime, nullable=True)

    lesson_instance = relationship("LessonInstance")
    coach = relationship("Coach")
    original_player = relationship("Player", foreign_keys=[original_player_id])
    filled_by_player = relationship("Player", foreign_keys=[filled_by_player_id])
    level = relationship("CoachLevel")
    notification_events = relationship("NotificationEvent", back_populates="vacancy")

    @property
    def name(self):
        return f"Vacancy #{self.id} for {self.lesson_instance}"
