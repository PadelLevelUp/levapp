from sqlalchemy import Column, Integer, ForeignKey, Enum, DateTime
from sqlalchemy.orm import relationship

from padel_app.sql_db import db
from padel_app import model
from padel_app.tools.input_tools import Block, Field, Form
from padel_app.utils.dates import utcnow_naive


class ClubJoinRequest(db.Model, model.Model):
    """clubs.join-request — an approved, self-registered coach asks to join an
    existing club; a current member approves or declines.

    Uniqueness of a *pending* request per (club, coach) is a partial unique
    index in the migration (`uq_club_join_request_pending`, Postgres only);
    the service enforces the same rule so sqlite tests and the API agree.
    """

    __tablename__ = "club_join_requests"
    __table_args__ = {"extend_existing": True}

    page_title = "Club Join Requests"
    model_name = "ClubJoinRequest"

    id = Column(Integer, primary_key=True)

    club_id = Column(
        Integer, ForeignKey("clubs.id", ondelete="CASCADE"), nullable=False
    )
    club = relationship("Club")

    coach_id = Column(
        Integer, ForeignKey("coaches.id", ondelete="CASCADE"), nullable=False
    )
    coach = relationship("Coach", foreign_keys=[coach_id])

    status = Column(
        Enum(
            "pending",
            "approved",
            "rejected",
            "withdrawn",
            name="club_join_request_status",
        ),
        nullable=False,
        server_default="pending",
        default="pending",
    )
    requested_at = Column(DateTime, nullable=False, default=utcnow_naive)
    decided_at = Column(DateTime, nullable=True)

    decided_by_coach_id = Column(
        Integer, ForeignKey("coaches.id", ondelete="SET NULL"), nullable=True
    )
    decided_by_coach = relationship("Coach", foreign_keys=[decided_by_coach_id])

    @property
    def name(self):
        return f"Join request for club {self.club_id} by coach {self.coach_id} ({self.status})"

    def __repr__(self):
        return f"<ClubJoinRequest club={self.club_id} coach={self.coach_id} status={self.status}>"

    def __str__(self):
        return self.name

    @property
    def display_name(self):
        return str(self)

    @classmethod
    def display_all_info(cls):
        searchable = {"field": "status", "label": "Status"}
        columns = [
            {"field": "club", "label": "Club"},
            {"field": "coach", "label": "Coach"},
            {"field": "status", "label": "Status"},
            {"field": "requested_at", "label": "Requested At"},
        ]
        return searchable, columns

    @classmethod
    def get_create_form(cls):
        def get_field(name, type, label=None, **kwargs):
            return Field(
                instance_id=cls.id,
                model=cls.model_name,
                name=name,
                type=type,
                label=label or name.capitalize(),
                **kwargs,
            )

        form = Form()
        info_block = Block(
            "info_block",
            fields=[
                get_field("club", "ManyToOne", label="Club", related_model="Club"),
                get_field("coach", "ManyToOne", label="Coach", related_model="Coach"),
                get_field(
                    "status",
                    "Select",
                    label="Status",
                    options=["pending", "approved", "rejected", "withdrawn"],
                ),
                get_field("requested_at", "DateTime", label="Requested At"),
                get_field("decided_at", "DateTime", label="Decided At"),
            ],
        )
        form.add_block(info_block)
        return form
