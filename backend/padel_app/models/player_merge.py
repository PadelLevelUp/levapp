"""players.claim rule 5i (PAD-528): the audit row of one placeholder merge.

The placeholder Player row is deleted by the merge, so ``placeholder_player_id``
is a plain integer, not a FK. The row records who confirmed, which trigger ran
and the dry-run counters as they were executed (rule 5j). It enables
investigation, never undo.
"""
from sqlalchemy import JSON, Column, Enum, ForeignKey, Integer
from sqlalchemy.orm import relationship

from padel_app.sql_db import db
from padel_app import model


class PlayerMerge(db.Model, model.Model):
    __tablename__ = "player_merges"
    __table_args__ = {"extend_existing": True}

    page_title = "Player Merges"
    model_name = "PlayerMerge"

    id = Column(Integer, primary_key=True)

    #: The merged-away Player's id. No FK: that row no longer exists.
    placeholder_player_id = Column(Integer, nullable=False, index=True)
    placeholder_user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    target_player_id = Column(Integer, ForeignKey("players.id", ondelete="SET NULL"), nullable=True, index=True)
    target_user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    requested_by_coach_id = Column(Integer, ForeignKey("coaches.id", ondelete="SET NULL"), nullable=True)
    #: Who confirmed the irreversible step: the student (rule 4), or the coach
    #: when rule 4d says no accept is needed.
    confirmed_by_user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    trigger = Column(
        Enum("invite_link", "coach_request", name="player_merge_trigger"), nullable=False
    )
    #: ``{"moves": {...}, "dropped": {...}, "merged": {...}}`` — rule 5j's counters.
    counts = Column(JSON, nullable=False, default=dict)

    target_player = relationship("Player", foreign_keys=[target_player_id])

    @property
    def name(self):
        return f"merge {self.placeholder_player_id} → {self.target_player_id}"

    def __repr__(self):
        return f"<PlayerMerge {self.placeholder_player_id} -> {self.target_player_id} ({self.trigger})>"

    def __str__(self):
        return self.name

    @property
    def display_name(self):
        return str(self)

    @classmethod
    def display_all_info(cls):
        searchable = {"field": "placeholder_player_id", "label": "Placeholder"}
        columns = [
            {"field": "placeholder_player_id", "label": "Placeholder"},
            {"field": "target_player", "label": "Target"},
            {"field": "trigger", "label": "Trigger"},
            {"field": "created_at", "label": "When"},
        ]
        return searchable, columns
