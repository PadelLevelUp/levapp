from sqlalchemy import Column, Integer, ForeignKey, UniqueConstraint
from sqlalchemy.orm import relationship

from padel_app.sql_db import db
from padel_app import model
from padel_app.tools.input_tools import Block, Field, Form


class Association_CoachLessonInstance(db.Model, model.Model):
    __tablename__ = "coach_in_lesson_instance"
    __table_args__ = (
        UniqueConstraint(
            "coach_id", "lesson_instance_id", name="uq_coach_lesson_instance"
        ),
        {"extend_existing": True},
    )

    page_title = "Coach ↔ Lesson Instance"
    model_name = "Association_CoachLessonInstance"

    id = Column(Integer, primary_key=True)
    coach_id = Column(Integer, ForeignKey("coaches.id", ondelete="CASCADE"))
    lesson_instance_id = Column(
        Integer, ForeignKey("lesson_instances.id", ondelete="CASCADE")
    )

    coach = relationship("Coach", back_populates="lesson_instances_relations")
    lesson_instance = relationship("LessonInstance", back_populates="coaches_relations")

    def __repr__(self):
        return f"<CoachLessonInstance {self.coach.name} - {self.lesson_instance}>"

    def __str__(self):
        return f"{self.coach.name} - {self.lesson_instance}"

    @property
    def name(self):
        return str(self)

    @classmethod
    def display_all_info(cls):
        searchable = {"field": "coach", "label": "Coach"}
        columns = [
            {"field": "coach", "label": "Coach"},
            {"field": "lesson_instance", "label": "Lesson Instance"},
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
                    "coach_id", "ManyToOne", label="Coach", related_model="Coach"
                ),
                get_field(
                    "lesson_instance_id",
                    "ManyToOne",
                    label="Lesson Instance",
                    related_model="LessonInstance",
                ),
            ],
        )
        form.add_block(info_block)

        return form
