from sqlalchemy import Column, Integer, ForeignKey, UniqueConstraint
from sqlalchemy.orm import relationship

from padel_app.sql_db import db
from padel_app import model
from padel_app.tools.input_tools import Block, Field, Form


class Association_PlayerClub(db.Model, model.Model):
    __tablename__ = "player_in_club"
    __table_args__ = (
        UniqueConstraint("player_id", "club_id", name="uq_player_club"),
        {"extend_existing": True},
    )

    page_title = "Player ↔ Club"
    model_name = "Association_PlayerClub"

    id = Column(Integer, primary_key=True)
    player_id = Column(Integer, ForeignKey("players.id", ondelete="CASCADE"))
    club_id = Column(Integer, ForeignKey("clubs.id", ondelete="CASCADE"))

    player = relationship("Player", back_populates="clubs_relations")
    club = relationship("Club", back_populates="players_relations")

    def __repr__(self):
        return f"<PlayerClub {self.player.name} - {self.club.name}>"

    def __str__(self):
        return f"{self.player.name} - {self.club.name}"

    @property
    def name(self):
        return str(self)

    @classmethod
    def display_all_info(cls):
        searchable = {"field": "player", "label": "Player"}
        columns = [
            {"field": "player", "label": "Player"},
            {"field": "club", "label": "Club"},
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
                get_field(
                    "player_id", "ManyToOne", label="Player", related_model="Player"
                ),
                get_field("club_id", "ManyToOne", label="Club", related_model="Club"),
            ],
        )
        form.add_block(info_block)

        return form
