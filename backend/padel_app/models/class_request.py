from sqlalchemy import Column, DateTime, Enum, ForeignKey, Index, Integer, Text
from sqlalchemy.orm import relationship

from padel_app.sql_db import db
from padel_app import model
from padel_app.utils.dates import utcnow_naive


class ClassRequest(db.Model, model.Model):
    """classes.class-requests (PAD-104) — a student asks a coach for a class
    at a slot the coach's calendar leaves free; the coach accepts, declines or
    proposes another time. ``start_datetime``/``end_datetime`` are the slot
    currently on the table (moved by a counter-proposal); ``hold_block_id``
    is the calendar block holding it on the coach's calendar while open.
    """

    __tablename__ = "class_requests"
    # Created by migration e4b8c2d17a35 (PAD-104); declared so autogenerate
    # stops proposing to drop them (PAD-220).
    __table_args__ = (
        Index("ix_class_requests_coach_id", "coach_id"),
        Index("ix_class_requests_player_id", "player_id"),
        Index("ix_class_requests_start_datetime", "start_datetime"),
        {"extend_existing": True},
    )

    page_title = "Class Requests"
    model_name = "ClassRequest"

    id = Column(Integer, primary_key=True)

    player_id = Column(Integer, ForeignKey("players.id", ondelete="CASCADE"), nullable=False)
    player = relationship("Player", foreign_keys=[player_id])

    coach_id = Column(Integer, ForeignKey("coaches.id", ondelete="CASCADE"), nullable=False)
    coach = relationship("Coach", foreign_keys=[coach_id])

    start_datetime = Column(DateTime, nullable=False)
    end_datetime = Column(DateTime, nullable=False)
    note = Column(Text, nullable=True)

    status = Column(
        Enum("pending", "countered", "accepted", "declined", "withdrawn", name="class_request_status"),
        nullable=False,
        server_default="pending",
        default="pending",
    )
    decided_by = Column(Enum("coach", "student", name="class_request_decider"), nullable=True)
    decided_at = Column(DateTime, nullable=True)

    hold_block_id = Column(Integer, ForeignKey("calendar_blocks.id", ondelete="SET NULL"), nullable=True)
    hold_block = relationship("CalendarBlock", foreign_keys=[hold_block_id])

    lesson_id = Column(Integer, ForeignKey("lessons.id", ondelete="SET NULL"), nullable=True)
    lesson = relationship("Lesson", foreign_keys=[lesson_id])

    @property
    def is_open(self) -> bool:
        return self.status in ("pending", "countered")

    @property
    def name(self):
        return f"Class request by player {self.player_id} to coach {self.coach_id} ({self.status})"

    def __repr__(self):
        return f"<ClassRequest player={self.player_id} coach={self.coach_id} status={self.status}>"

    def __str__(self):
        return self.name

    @property
    def display_name(self):
        return str(self)

    @classmethod
    def display_all_info(cls):
        searchable = {"field": "status", "label": "Status"}
        columns = [
            {"field": "player", "label": "Player"},
            {"field": "coach", "label": "Coach"},
            {"field": "start_datetime", "label": "Start"},
            {"field": "status", "label": "Status"},
        ]
        return searchable, columns
