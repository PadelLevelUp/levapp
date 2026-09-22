from sqlalchemy import Column, Integer, Float, String, ForeignKey, DateTime, Index, func, text
from sqlalchemy.orm import relationship
from datetime import datetime

from padel_app.sql_db import db
from padel_app.utils.dates import utcnow_naive
from padel_app import model
from padel_app.tools.input_tools import Block, Field, Form


class EvaluationEntry(db.Model, model.Model):
    __tablename__ = "evaluation_entries"
    __table_args__ = (
        # PAD-363 (evaluations.records): a record holds at most one rating per category.
        Index(
            "uq_evaluation_entries_record_category", "record_id", "category_id", unique=True,
            postgresql_where=text("record_id IS NOT NULL"), sqlite_where=text("record_id IS NOT NULL"),
        ),
        {"extend_existing": True},
    )

    page_title = "Evaluation Entries"
    model_name = "EvaluationEntry"

    id = Column(Integer, primary_key=True)

    coach_player_id = Column(
        Integer, ForeignKey("coach_in_player.id", ondelete="CASCADE"), nullable=False
    )
    coach_player = relationship("Association_CoachPlayer", back_populates="evaluations")

    category_id = Column(
        Integer, ForeignKey("evaluation_categories.id", ondelete="CASCADE"), nullable=False
    )
    category = relationship("EvaluationCategory", back_populates="entries")

    # PAD-363 (evaluations.records): the record this score is the rating of. NULL
    # for the earlier scores of a day that the record's slot has moved on from —
    # they stay as history. Written only by `evaluation_record_service`.
    record_id = Column(
        Integer, ForeignKey("evaluation_records.id", ondelete="CASCADE"), nullable=True
    )
    record = relationship("EvaluationRecord", back_populates="entries")

    score = Column(Float, nullable=False)
    # PAD-403 (evaluations.legacy-conversion rules 2, 3): the 1-10 score before the
    # conversion to stars; NULL for every score rated afterwards. Migration-only.
    score_before_conversion = Column(Integer, nullable=True)
    comment = Column(String(500), nullable=True)
    # PAD-273 (audit M12): `.strftime` is called on it, so it can never be NULL.
    # The app's own clock, looked up at WRITE time (`lambda`, not the function object): the tests
    # pin `utcnow_naive` by rebinding the name (B-100), which a default holding the original
    # function — `datetime.utcnow` before, or `utcnow_naive` itself — can never see. That put a
    # legacy row on the real day while a pinned v2 write landed on the pinned day: red from
    # 00:00 UTC every night, green all day. Same instant in production either way.
    evaluated_at = Column(DateTime, default=lambda: utcnow_naive(), nullable=False, server_default=func.now())

    @property
    def name(self):
        return f"{self.category.name}: {self.score} ({self.evaluated_at.strftime('%Y-%m-%d')})"

    def __repr__(self):
        return f"<EvaluationEntry {self.category.name} - {self.score}>"

    def __str__(self):
        return f"{self.category.name}: {self.score}"

    @property
    def display_name(self):
        return str(self)

    @classmethod
    def display_all_info(cls):
        searchable = {"field": "category", "label": "Category"}
        columns = [
            {"field": "coach_player", "label": "Coach ↔ Player"},
            {"field": "category", "label": "Category"},
            {"field": "score", "label": "Score"},
            {"field": "evaluated_at", "label": "Evaluated At"},
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
                get_field(
                    "category",
                    "ManyToOne",
                    label="Category",
                    related_model="EvaluationCategory",
                ),
                get_field("score", "Float", label="Score"),
                get_field("comment", "Text", label="Comment"),
                get_field("evaluated_at", "DateTime", label="Evaluated at"),
            ],
        )
        form.add_block(info_block)

        return form
