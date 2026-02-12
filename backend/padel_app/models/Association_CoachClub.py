from sqlalchemy import Column, Integer, ForeignKey, UniqueConstraint
from sqlalchemy.orm import relationship

from padel_app.sql_db import db
from padel_app import model
from padel_app.tools.input_tools import Block, Field, Form


class Association_CoachClub(db.Model, model.Model):
    __tablename__ = "coach_in_club"
    __table_args__ = (
        UniqueConstraint("coach_id", "club_id", name="uq_coach_club"),
        {"extend_existing": True},
    )

    page_title = "Coach ↔ Club"
    model_name = "Association_CoachClub"

    id = Column(Integer, primary_key=True)
    coach_id = Column(Integer, ForeignKey("coaches.id", ondelete="CASCADE"))
    club_id = Column(Integer, ForeignKey("clubs.id", ondelete="CASCADE"))

    coach = relationship("Coach", back_populates="clubs_relations")
    club = relationship("Club", back_populates="coaches_relations")

    def __repr__(self):
        return f"<CoachClub {self.coach.name} - {self.club.name}>"

    def __str__(self):
        return f"{self.coach.name} - {self.club.name}"

    @property
    def name(self):
        return str(self)

    @classmethod
    def display_all_info(cls):
        searchable = {"field": "coach", "label": "Coach"}
        columns = [
            {"field": "coach", "label": "Coach"},
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
                    "coach", "ManyToOne", label="Coach", related_model="Coach"
                ),
                get_field("club", "ManyToOne", label="Club", related_model="Club"),
            ],
        )
        form.add_block(info_block)
        return form
