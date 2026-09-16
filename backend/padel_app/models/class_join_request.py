from sqlalchemy import Column, DateTime, Enum, ForeignKey, Index, Integer, text
from sqlalchemy.orm import relationship

from padel_app.sql_db import db
from padel_app import model
from padel_app.utils.dates import utcnow_naive


class ClassJoinRequest(db.Model, model.Model):
    """classes.join-requests — a student who can see an open spot asks to
    attend; the coach accepts or rejects; first fill wins (PAD-131).

    One *pending* request per (instance, player) is a partial unique index in
    the migration (`uq_class_join_request_pending`, Postgres only); the service
    enforces the same rule so sqlite tests and the API agree.
    """

    __tablename__ = "class_join_requests"
    # Created by migration a7c31e9f04d2 (PAD-131); declared so autogenerate
    # stops proposing to drop them (PAD-220). The partial unique index enforces
    # one pending request; sqlite_where keeps the test database identical.
    __table_args__ = (
        Index("ix_class_join_requests_lesson_instance_id", "lesson_instance_id"),
        Index("ix_class_join_requests_player_id", "player_id"),
        Index("ix_class_join_requests_coach_id", "coach_id"),
        Index(
            "uq_class_join_request_pending", "lesson_instance_id", "player_id", unique=True,
            postgresql_where=text("status = 'pending'"), sqlite_where=text("status = 'pending'"),
        ),
        {"extend_existing": True},
    )

    page_title = "Class Join Requests"
    model_name = "ClassJoinRequest"

    id = Column(Integer, primary_key=True)

    lesson_instance_id = Column(
        Integer, ForeignKey("lesson_instances.id", ondelete="CASCADE"), nullable=False
    )
    lesson_instance = relationship("LessonInstance")

    player_id = Column(
        Integer, ForeignKey("players.id", ondelete="CASCADE"), nullable=False
    )
    player = relationship("Player", foreign_keys=[player_id])

    coach_id = Column(
        Integer, ForeignKey("coaches.id", ondelete="CASCADE"), nullable=False
    )
    coach = relationship("Coach", foreign_keys=[coach_id])

    status = Column(
        Enum(
            "pending",
            "accepted",
            "rejected",
            "withdrawn",
            "superseded",
            name="class_join_request_status",
        ),
        nullable=False,
        server_default="pending",
        default="pending",
    )
    created_at = Column(DateTime, nullable=False, default=utcnow_naive)
    decided_at = Column(DateTime, nullable=True)

    decided_by_coach_id = Column(
        Integer, ForeignKey("coaches.id", ondelete="SET NULL"), nullable=True
    )
    decided_by_coach = relationship("Coach", foreign_keys=[decided_by_coach_id])

    @property
    def name(self):
        return f"Join request for class {self.lesson_instance_id} by player {self.player_id} ({self.status})"

    def __repr__(self):
        return f"<ClassJoinRequest instance={self.lesson_instance_id} player={self.player_id} status={self.status}>"

    def __str__(self):
        return self.name

    @property
    def display_name(self):
        return str(self)

    @classmethod
    def display_all_info(cls):
        searchable = {"field": "status", "label": "Status"}
        columns = [
            {"field": "lesson_instance", "label": "Class"},
            {"field": "player", "label": "Player"},
            {"field": "status", "label": "Status"},
            {"field": "created_at", "label": "Requested At"},
        ]
        return searchable, columns
