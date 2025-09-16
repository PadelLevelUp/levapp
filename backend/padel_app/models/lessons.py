from sqlalchemy import Column, Integer, String, Text, ForeignKey, DateTime, Boolean
from sqlalchemy.orm import relationship

from padel_app.sql_db import db
from padel_app import model
from padel_app.tools.input_tools import Block, Field, Form


class Lesson(db.Model, model.Model):
    __tablename__ = "lessons"
    __table_args__ = {"extend_existing": True}

    page_title = "Lessons"
    model_name = "Lesson"

    id = Column(Integer, primary_key=True)

    title = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)

    start_time = Column(DateTime, nullable=False)
    end_time = Column(DateTime, nullable=False)

    is_recurring = Column(Boolean, default=False, nullable=False)
    recurrence_rule = Column(Text, nullable=True)
    recurrence_end = Column(DateTime, nullable=True)

    # Many-to-many: Lesson <-> Coach
    coaches_relations = relationship(
        "Association_CoachLesson", back_populates="lesson", cascade="all, delete-orphan"
    )

    club_id = Column(
        Integer, ForeignKey("clubs.id", ondelete="CASCADE"), nullable=False
    )
    club = relationship("Club", back_populates="lessons")

    @property
    def coaches(self):
        return [rel.coach for rel in self.coaches_relations]

    # Many-to-many: Lesson <-> Player
    players_relations = relationship(
        "Association_PlayerLesson",
        back_populates="lesson",
        cascade="all, delete-orphan",
    )

    @property
    def players(self):
        return [rel.player for rel in self.players_relations]

    # One-to-many: Lesson -> LessonInstance
    instances = relationship(
        "LessonInstance", back_populates="lesson", cascade="all, delete-orphan"
    )

    def __repr__(self):
        return f"<Lesson {self.title}>"

    def __str__(self):
        return self.title

    @classmethod
    def display_all_info(cls):
        searchable = {"field": "title", "label": "Title"}
        columns = [
            {"field": "title", "label": "Title"},
            {"field": "start_time", "label": "Start"},
            {"field": "end_time", "label": "End"},
            {"field": "is_recurring", "label": "Recurring"},
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
                get_field("title", "Text", label="Title"),
                get_field("description", "Text", label="Description"),
                get_field("start_time", "DateTime", label="Start Time"),
                get_field("end_time", "DateTime", label="End Time"),
                get_field("is_recurring", "Boolean", label="Is Recurring"),
                get_field("recurrence_rule", "Text", label="Recurrence Rule"),
                get_field("recurrence_end", "DateTime", label="Recurrence End"),
                get_field(
                    "coaches_relations",
                    "OneToMany",
                    label="Coaches",
                    related_model="Association_CoachLesson",
                ),
                get_field(
                    "players_relations",
                    "OneToMany",
                    label="Players",
                    related_model="Association_PlayerLesson",
                ),
            ],
        )
        form.add_block(info_block)

        return form
