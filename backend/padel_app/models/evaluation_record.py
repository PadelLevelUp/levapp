from sqlalchemy import Column, Date, ForeignKey, Index, Integer, Text, text
from sqlalchemy.orm import relationship

from padel_app.sql_db import db
from padel_app import model
from padel_app.tools.input_tools import Block, Field, Form


class EvaluationRecord(db.Model, model.Model):
    """One evaluation (PAD-363, evaluations.records): a coach's ratings of one
    player on one club-local day, optionally tied to the class it happened in,
    with one private note. Its ratings are the `evaluation_entries` rows pointing
    at it — at most one per category. Written only by `evaluation_record_service`.
    """

    __tablename__ = "evaluation_records"
    # One class-less record per (coach-player, day); one more per class of that day.
    __table_args__ = (
        Index(
            "uq_evaluation_records_classless_day", "coach_player_id", "evaluated_on", unique=True,
            postgresql_where=text("lesson_instance_id IS NULL"), sqlite_where=text("lesson_instance_id IS NULL"),
        ),
        Index(
            "uq_evaluation_records_class_day", "coach_player_id", "lesson_instance_id", "evaluated_on", unique=True,
            postgresql_where=text("lesson_instance_id IS NOT NULL"),
            sqlite_where=text("lesson_instance_id IS NOT NULL"),
        ),
        {"extend_existing": True},
    )

    page_title = "Evaluation Records"
    model_name = "EvaluationRecord"

    id = Column(Integer, primary_key=True)

    coach_player_id = Column(
        Integer, ForeignKey("coach_in_player.id", ondelete="CASCADE"), nullable=False
    )
    coach_player = relationship("Association_CoachPlayer", back_populates="evaluation_records")

    # The class stays optional and outlives nothing: deleting the occurrence
    # keeps the evaluation, as a class-less one.
    lesson_instance_id = Column(
        Integer, ForeignKey("lesson_instances.id", ondelete="SET NULL"), nullable=True
    )
    lesson_instance = relationship("LessonInstance")

    # The day on the club's clock (R-023, `utils.dates.CLUB_TZ`), not the UTC date.
    evaluated_on = Column(Date, nullable=False)
    note = Column(Text, nullable=True)

    entries = relationship(
        "EvaluationEntry", back_populates="record", cascade="all, delete-orphan",
        passive_deletes=True,
    )

    @property
    def name(self):
        return f"{self.coach_player} — {self.evaluated_on.isoformat()}"

    def __repr__(self):
        return f"<EvaluationRecord {self.coach_player_id} {self.evaluated_on}>"

    def __str__(self):
        return self.name

    @property
    def display_name(self):
        return str(self)

    @classmethod
    def display_all_info(cls):
        searchable = {"field": "coach_player", "label": "Coach ↔ Player"}
        columns = [
            {"field": "coach_player", "label": "Coach ↔ Player"},
            {"field": "evaluated_on", "label": "Evaluated On"},
            {"field": "lesson_instance", "label": "Class"},
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
                    "coach_player",
                    "ManyToOne",
                    label="Coach ↔ Player",
                    related_model="Association_CoachPlayer",
                ),
                get_field("evaluated_on", "Date", label="Evaluated on"),
                get_field("note", "Text", label="Private note"),
            ],
        )
        form.add_block(info_block)

        return form
