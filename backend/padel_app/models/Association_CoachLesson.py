from sqlalchemy import Column, Integer, ForeignKey, UniqueConstraint
from sqlalchemy.orm import relationship

from padel_app.sql_db import db
from padel_app import model
from padel_app.tools.input_tools import Block, Field, Form


class Association_CoachLesson(db.Model, model.Model):
    __tablename__ = "coach_in_lesson"
    __table_args__ = (
        UniqueConstraint("coach_id", "lesson_id", name="uq_coach_lesson"),
        {"extend_existing": True},
    )

    page_title = "Coach ↔ Lesson"
    model_name = "association_coachlesson"

    id = Column(Integer, primary_key=True)
    coach_id = Column(Integer, ForeignKey("coaches.id", ondelete="CASCADE"))
    lesson_id = Column(Integer, ForeignKey("lessons.id", ondelete="CASCADE"))

    coach = relationship("Coach", back_populates="lessons_relations")
    lesson = relationship("Lesson", back_populates="coaches_relations")

    def __repr__(self):
        return f"<CoachLesson {self.coach.name} - {self.lesson.name}>"

    def __str__(self):
        return f"{self.coach.name} - {self.lesson.name}"

    @property
    def name(self):
        return f"{self.coach.name} - {self.lesson.name}"

    @classmethod
    def display_all_info(cls):
        searchable_column = {"field": "coach", "label": "Coach"}
        table_columns = [
            {"field": "coach", "label": "Coach"},
            {"field": "lesson", "label": "Lesson"},
        ]
        return searchable_column, table_columns

    @classmethod
    def get_create_form(cls):
        def get_field(name, label, field_type, **kwargs):
            return Field(name=name, label=label, field_type=field_type, **kwargs)

        info_block = Block(
            title="Coach ↔ Lesson",
            fields=[
                get_field("coach_id", "Coach", "ManyToOne", model="coach"),
                get_field("lesson_id", "Lesson", "ManyToOne", model="lesson"),
            ],
        )
        return Form(blocks=[info_block])
