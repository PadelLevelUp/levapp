"""players.join-token — a coach's reusable, rotatable roster join token (PAD-212).

Unlike PlayerInvitation it is not bound to a player: one QR serves a whole class.
Rotation (minting again) is the only revocation; rows are never deleted so `uses`
stays auditable.
"""
from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import relationship

from padel_app.sql_db import db
from padel_app import model
from padel_app.tools.input_tools import Block, Field, Form


class CoachJoinToken(db.Model, model.Model):
    __tablename__ = "coach_join_tokens"
    __table_args__ = {"extend_existing": True}

    page_title = "Coach Join Tokens"
    model_name = "CoachJoinToken"

    id = Column(Integer, primary_key=True)

    coach_id = Column(
        Integer, ForeignKey("coaches.id", ondelete="CASCADE"), nullable=False
    )
    coach = relationship("Coach")

    club_id = Column(
        Integer, ForeignKey("clubs.id", ondelete="CASCADE"), nullable=False
    )
    club = relationship("Club")

    token = Column(String(64), unique=True, nullable=False, index=True)
    expires_at = Column(DateTime, nullable=False)
    is_active = Column(Boolean, nullable=False, default=True, server_default="1")
    uses = Column(Integer, nullable=False, default=0, server_default="0")

    @property
    def name(self):
        return f"Join token for coach {self.coach_id} ({'active' if self.is_active else 'retired'})"

    def __repr__(self):
        return f"<CoachJoinToken coach={self.coach_id} active={self.is_active}>"

    def __str__(self):
        return self.name

    @property
    def display_name(self):
        return str(self)

    @classmethod
    def display_all_info(cls):
        searchable = {"field": "token", "label": "Token"}
        columns = [
            {"field": "coach", "label": "Coach"},
            {"field": "club", "label": "Club"},
            {"field": "is_active", "label": "Active"},
            {"field": "uses", "label": "Uses"},
            {"field": "expires_at", "label": "Expires At"},
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
                get_field("coach", "ManyToOne", label="Coach", related_model="Coach"),
                get_field("club", "ManyToOne", label="Club", related_model="Club"),
                get_field("token", "Text", label="Token"),
                get_field("is_active", "Boolean", label="Active"),
                get_field("uses", "Integer", label="Uses"),
                get_field("expires_at", "DateTime", label="Expires At"),
            ],
        )
        form.add_block(info_block)
        return form
