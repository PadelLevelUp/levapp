"""clubs.courts (PAD-194 v1): a club's courts — a name and a display order."""
from sqlalchemy import Column, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import relationship

from padel_app.sql_db import db
from padel_app import model
from padel_app.tools.input_tools import Block, Field, Form


class Court(db.Model, model.Model):
    __tablename__ = "courts"
    __table_args__ = (
        UniqueConstraint("club_id", "name", name="uq_courts_club_name"),
        {"extend_existing": True},
    )

    page_title = "Courts"
    model_name = "Court"

    id = Column(Integer, primary_key=True)
    club_id = Column(Integer, ForeignKey("clubs.id", ondelete="CASCADE"), nullable=False)
    club = relationship("Club", back_populates="courts")
    name = Column(String(80), nullable=False)
    position = Column(Integer, nullable=False, default=0, server_default="0")

    @property
    def display_name(self):
        return self.name

    def __repr__(self):
        return f"<Court {self.club_id}: {self.name}>"

    def __str__(self):
        return self.name

    @classmethod
    def display_all_info(cls):
        searchable = {"field": "name", "label": "Court"}
        columns = [
            {"field": "club", "label": "Club"},
            {"field": "name", "label": "Court"},
            {"field": "position", "label": "Position"},
        ]
        return searchable, columns

    @classmethod
    def get_create_form(cls):
        def get_field(name, type, label=None, **kwargs):
            return Field(instance_id=cls.id, model=cls.model_name, name=name, type=type, label=label or name.capitalize(), **kwargs)

        form = Form()
        form.add_block(
            Block(
                "info_block",
                fields=[
                    get_field("club", "ManyToOne", label="Club", related_model="Club"),
                    get_field("name", "Text", label="Name"),
                    get_field("position", "Integer", label="Position"),
                ],
            )
        )
        return form

    def frontend_dict(self):
        return {"id": self.id, "clubId": self.club_id, "name": self.name, "position": self.position}
