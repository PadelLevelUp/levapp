from sqlalchemy import Column, Integer, ForeignKey, UniqueConstraint
from sqlalchemy.orm import relationship

from padel_app.sql_db import db
from padel_app import model
from padel_app.tools.input_tools import Block, Field, Form


class Association_CoachPlayer(db.Model, model.Model):
    __tablename__ = "coach_in_player"
    __table_args__ = (
        UniqueConstraint("coach_id", "player_id", name="uq_coach_player"),
        {"extend_existing": True},
    )

    page_title = "Coach ↔ Player"
    model_name = "association_coachplayer"

    id = Column(Integer, primary_key=True)
    coach_id = Column(Integer, ForeignKey("coaches.id", ondelete="CASCADE"))
    player_id = Column(Integer, ForeignKey("players.id", ondelete="CASCADE"))

    coach = relationship("Coach", back_populates="players_relations")
    player = relationship("Player", back_populates="coaches_relations")

    def __repr__(self):
        return f"<CoachPlayer {self.coach.name} - {self.player.name}>"

    def __str__(self):
        return f"{self.coach.name} - {self.player.name}"

    @property
    def name(self):
        return f"{self.coach.name} - {self.player.name}"

    @classmethod
    def display_all_info(cls):
        searchable_column = {"field": "coach", "label": "Coach"}
        table_columns = [
            {"field": "coach", "label": "Coach"},
            {"field": "player", "label": "Player"},
        ]
        return searchable_column, table_columns

    @classmethod
    def get_create_form(cls):
        def get_field(name, label, field_type, **kwargs):
            return Field(name=name, label=label, field_type=field_type, **kwargs)

        info_block = Block(
            title="Coach ↔ Player",
            fields=[
                get_field("coach_id", "Coach", "ManyToOne", model="coach"),
                get_field("player_id", "Player", "ManyToOne", model="player"),
            ],
        )
        return Form(blocks=[info_block])
