"""players.claim (PAD-213): a coach asks a student to link a coach-created
placeholder player record to the student's real account.

The student is the actor who decides; accepting runs the merge in
``services.player_claim_service``. At most one pending request per placeholder
player (partial unique index in the migration; also enforced in the service,
because SQLite in the test suite does not apply the partial index).
"""
from sqlalchemy import Column, DateTime, Enum, ForeignKey, Index, Integer, text
from sqlalchemy.orm import relationship

from padel_app.sql_db import db
from padel_app import model
from padel_app.utils.dates import utcnow_naive


class PlayerClaimRequest(db.Model, model.Model):
    __tablename__ = "player_claim_requests"
    # The partial unique index migration e3f4a5b6c7d8 created: "one pending claim
    # per player". Declared so autogenerate stops proposing to drop it (PAD-220).
    __table_args__ = (
        Index(
            "uq_player_claim_request_pending", "player_id", unique=True,
            postgresql_where=text("status = 'pending'"), sqlite_where=text("status = 'pending'"),
        ),
        {"extend_existing": True},
    )

    page_title = "Player Claim Requests"
    model_name = "PlayerClaimRequest"

    id = Column(Integer, primary_key=True)

    #: The placeholder Player (coach-created, never activated).
    player_id = Column(
        Integer, ForeignKey("players.id", ondelete="CASCADE"), nullable=False, index=True
    )
    player = relationship("Player", foreign_keys=[player_id])

    #: The real account the record should be folded into.
    target_user_id = Column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    target_user = relationship("User", foreign_keys=[target_user_id])

    requested_by_coach_id = Column(
        Integer, ForeignKey("coaches.id", ondelete="SET NULL"), nullable=True
    )
    requested_by_coach = relationship("Coach", foreign_keys=[requested_by_coach_id])

    status = Column(
        Enum("pending", "accepted", "rejected", "revoked", name="player_claim_request_status"),
        nullable=False,
        server_default="pending",
        default="pending",
    )
    decided_at = Column(DateTime, nullable=True)

    @property
    def name(self):
        return f"Claim request for player {self.player_id} ({self.status})"

    def __repr__(self):
        return f"<PlayerClaimRequest player={self.player_id} target={self.target_user_id} {self.status}>"

    def __str__(self):
        return self.name

    @property
    def display_name(self):
        return str(self)

    @classmethod
    def display_all_info(cls):
        searchable = {"field": "status", "label": "Status"}
        columns = [
            {"field": "player", "label": "Placeholder player"},
            {"field": "target_user", "label": "Target user"},
            {"field": "status", "label": "Status"},
        ]
        return searchable, columns

    @classmethod
    def get_create_form(cls):
        from padel_app.tools.input_tools import Block, Field, Form

        def get_field(name, type, label=None, **kwargs):
            return Field(
                instance_id=cls.id, model=cls.model_name, name=name, type=type,
                label=label or name.capitalize(), **kwargs,
            )

        form = Form()
        form.add_block(Block("info_block", fields=[
            get_field("player", "ManyToOne", label="Placeholder player", related_model="Player"),
            get_field("target_user", "ManyToOne", label="Target user", related_model="User"),
            get_field("status", "Select", label="Status",
                      options=["pending", "accepted", "rejected", "revoked"]),
        ]))
        return form
