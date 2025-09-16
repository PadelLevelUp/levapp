from sqlalchemy import Column, Integer, String, ForeignKey
from sqlalchemy.orm import relationship

from padel_app.sql_db import db
from padel_app import model
from padel_app.tools.input_tools import Block, Field, Form


class Player(db.Model, model.Model):
    __tablename__ = "players"
    __table_args__ = {"extend_existing": True}

    page_title = "Players"
    model_name = "Player"

    id = Column(Integer, primary_key=True)
    name = Column(String(255), nullable=False)

    # Profile picture
    profile_picture_id = Column(Integer, ForeignKey("images.id", ondelete="SET NULL"))
    profile_picture = relationship("Image", foreign_keys=[profile_picture_id])

    @property
    def profile_picture_url(self):
        return self.profile_picture.url() if self.profile_picture else None

    # Relations to lessons
    lessons_relations = relationship(
        "Association_PlayerLesson",
        back_populates="player",
        cascade="all, delete-orphan",
    )

    @property
    def lessons(self):
        return [rel.lesson for rel in self.lessons_relations]

    # Relations to lesson instances
    lesson_instances_relations = relationship(
        "Association_PlayerLessonInstance",
        back_populates="player",
        cascade="all, delete-orphan",
    )

    @property
    def lesson_instances(self):
        return [rel.lesson_instance for rel in self.lesson_instances_relations]

    clubs_relations = relationship(
        "Association_PlayerClub", back_populates="player", cascade="all, delete-orphan"
    )

    @property
    def clubs(self):
        return [rel.club for rel in self.clubs_relations]

    coaches_relations = relationship(
        "Association_CoachPlayer", back_populates="player", cascade="all, delete-orphan"
    )

    @property
    def coaches(self):
        return [rel.coach for rel in self.coaches_relations]

    # Level history
    level_history = relationship(
        "PlayerLevelHistory", back_populates="player", cascade="all, delete-orphan"
    )

    def __repr__(self):
        return f"<Player {self.name}>"

    def __str__(self):
        return self.name

    @property
    def display_name(self):
        return self.name

    @classmethod
    def display_all_info(cls):
        searchable = {"field": "name", "label": "Name"}
        columns = [
            {"field": "name", "label": "Name"},
            {"field": "profile_picture", "label": "Picture"},
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

        picture_block = Block(
            "picture_block",
            fields=[
                get_field("profile_picture_id", "Picture", label="Profile Picture"),
            ],
        )
        form.add_block(picture_block)

        info_block = Block(
            "info_block",
            fields=[
                get_field("name", "Text", label="Name"),
                get_field(
                    "lessons_relations",
                    "OneToMany",
                    label="Lessons",
                    related_model="Association_PlayerLesson",
                ),
                get_field(
                    "lesson_instances_relations",
                    "OneToMany",
                    label="Lesson Instances",
                    related_model="Association_PlayerLessonInstance",
                ),
                get_field(
                    "level_history",
                    "OneToMany",
                    label="Level History",
                    related_model="PlayerLevelHistory",
                ),
            ],
        )
        form.add_block(info_block)

        return form
