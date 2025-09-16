from sqlalchemy import Column, Integer, ForeignKey, DateTime, Enum
from sqlalchemy.orm import relationship


from padel_app.sql_db import db
from padel_app import model
from padel_app.tools.input_tools import Block, Field, Form


class LessonInstance(db.Model, model.Model):
    __tablename__ = "lesson_instances"
    __table_args__ = {"extend_existing": True}

    page_title = "Lesson Instances"
    model_name = "LessonInstance"

    id = Column(Integer, primary_key=True)

    lesson_id = Column(
        Integer, ForeignKey("lessons.id", ondelete="CASCADE"), nullable=False
    )
    lesson = relationship("Lesson", back_populates="instances")

    start_time = Column(DateTime, nullable=False)
    end_time = Column(DateTime, nullable=False)

    status = Column(
        Enum(
            "scheduled",
            "canceled",
            "rescheduled",
            "completed",
            name="lesson_instance_status",
        ),
        default="scheduled",
        nullable=False,
    )

    club_id = Column(
        Integer, ForeignKey("clubs.id", ondelete="CASCADE"), nullable=False
    )
    club = relationship("Club", back_populates="lesson_instances")

    # Many-to-many: LessonInstance <-> Coach
    coaches_relations = relationship(
        "Association_CoachLessonInstance",
        back_populates="lesson_instance",
        cascade="all, delete-orphan",
    )

    @property
    def coaches(self):
        return [rel.coach for rel in self.coaches_relations]

    # Many-to-many: LessonInstance <-> Player
    players_relations = relationship(
        "Association_PlayerLessonInstance",
        back_populates="lesson_instance",
        cascade="all, delete-orphan",
    )

    @property
    def players(self):
        return [rel.player for rel in self.players_relations]

    def __repr__(self):
        return f"<LessonInstance {self.lesson.title} {self.start_time}>"

    def __str__(self):
        return f"{self.lesson.title} ({self.start_time.strftime('%Y-%m-%d %H:%M')})"

    @property
    def name(self):
        return str(self)

    @classmethod
    def display_all_info(cls):
        searchable = {"field": "lesson", "label": "Lesson"}
        columns = [
            {"field": "lesson", "label": "Lesson"},
            {"field": "start_time", "label": "Start"},
            {"field": "end_time", "label": "End"},
            {"field": "status", "label": "Status"},
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
                    "lesson_id", "ManyToOne", label="Lesson", related_model="Lesson"
                ),
                get_field("start_time", "DateTime", label="Start Time"),
                get_field("end_time", "DateTime", label="End Time"),
                get_field(
                    "status",
                    "Select",
                    label="Status",
                    choices=["scheduled", "canceled", "rescheduled", "completed"],
                ),
                get_field(
                    "coaches_relations",
                    "OneToMany",
                    label="Coaches",
                    related_model="Association_CoachLessonInstance",
                ),
                get_field(
                    "players_relations",
                    "OneToMany",
                    label="Players",
                    related_model="Association_PlayerLessonInstance",
                ),
            ],
        )
        form.add_block(info_block)

        return form
