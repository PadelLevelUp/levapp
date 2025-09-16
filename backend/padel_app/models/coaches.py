from sqlalchemy import Column, Integer, String
from sqlalchemy.orm import relationship
from padel_app.sql_db import db
from padel_app import model
from padel_app.tools.input_tools import Block, Field, Form


class Coach(db.Model, model.Model):
    __tablename__ = "coaches"
    __table_args__ = {"extend_existing": True}

    page_title = "Coach"
    model_name = "coach"

    id = Column(Integer, primary_key=True)
    name = Column(String(255), nullable=False)

    # One-to-many to Club
    clubs_relations = relationship(
        "Association_CoachClub", back_populates="coach", cascade="all, delete-orphan"
    )

    @property
    def clubs(self):
        return [rel.club for rel in self.clubs_relations]

    # Many-to-many: Lessons
    lessons_relations = relationship(
        "Association_CoachLesson",
        back_populates="coach",
        cascade="all, delete-orphan",
    )

    @property
    def lessons(self):
        return [rel.lesson for rel in self.lessons_relations]

    # Relations to lesson instances
    lesson_instances_relations = relationship(
        "Association_CoachLessonInstance",
        back_populates="coach",
        cascade="all, delete-orphan",
    )

    @property
    def lesson_instances(self):
        return [rel.lesson_instance for rel in self.lesson_instances_relations]

    # Many-to-many: Players
    players_relations = relationship(
        "Association_CoachPlayer",
        back_populates="coach",
        cascade="all, delete-orphan",
    )

    @property
    def players(self):
        return [rel.player for rel in self.players_relations]

    levels = relationship(
        "CoachLevel", back_populates="coach", cascade="all, delete-orphan"
    )

    # Player levels tracked by this coach
    player_levels = relationship(
        "PlayerLevelHistory", back_populates="coach", cascade="all, delete-orphan"
    )

    def __repr__(self):
        return f"<Coach {self.name}>"

    def __str__(self):
        return self.name

    @property
    def name_str(self):
        return self.name

    @classmethod
    def display_all_info(cls):
        searchable_column = {"field": "name", "label": "Name"}
        table_columns = [
            {"field": "name", "label": "Name"},
            {"field": "club", "label": "Club"},
        ]
        return searchable_column, table_columns

    @classmethod
    def get_create_form(cls):
        def get_field(name, label, field_type, **kwargs):
            return Field(name=name, label=label, field_type=field_type, **kwargs)

        info_block = Block(
            title="Coach Info",
            fields=[
                get_field("name", "Name", "Text"),
                get_field("club_id", "Club", "ManyToOne", model="club"),
                get_field(
                    "lessons_relations",
                    "Lessons",
                    "ManyToMany",
                    model="association_coachlesson",
                ),
                get_field(
                    "players_relations",
                    "Players",
                    "ManyToMany",
                    model="association_coachplayer",
                ),
            ],
        )

        return Form(blocks=[info_block])
