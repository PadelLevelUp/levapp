"""calendar.seasons (PAD-82): one recurring day/month season per coach.

`coach_seasons` holds at most one row per coach — `UNIQUE(coach_id)` is the
rule-1 invariant, enforced by the database so no write path (routes, the
generic editor, a script) can give a coach two seasons. `seasons_legacy` is
the verbatim snapshot of the pre-PAD-82 `seasons` rows the migration wrote;
the app never reads it, and it is not registered in the generic editor.
"""
from sqlalchemy import (
    Boolean,
    Column,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    SmallInteger,
    String,
    UniqueConstraint,
)
from sqlalchemy.orm import relationship

from padel_app.sql_db import db
from padel_app import model
from padel_app.tools.input_tools import Block, Field, Form


class CoachSeason(db.Model, model.Model):
    __tablename__ = "coach_seasons"
    __table_args__ = (
        UniqueConstraint("coach_id", name="uq_coach_seasons_coach_id"),
        {"extend_existing": True},
    )

    page_title = "Seasons"
    model_name = "CoachSeason"

    id = Column(Integer, primary_key=True)

    coach_id = Column(
        Integer, ForeignKey("coaches.id", ondelete="CASCADE"), nullable=False
    )
    coach = relationship("Coach", back_populates="season")

    label = Column(String(120), nullable=True)
    start_day = Column(SmallInteger, nullable=False)
    start_month = Column(SmallInteger, nullable=False)
    end_day = Column(SmallInteger, nullable=False)
    end_month = Column(SmallInteger, nullable=False)
    needs_review = Column(Boolean, nullable=False, default=False, server_default="0")

    @property
    def display_name(self):
        return f"{self.label or 'Season'} ({self.start_day}/{self.start_month} - {self.end_day}/{self.end_month})"

    def __repr__(self):
        return f"<CoachSeason {self.coach_id}: {self.display_name}>"

    def __str__(self):
        return self.display_name

    @classmethod
    def display_all_info(cls):
        searchable = {"field": "label", "label": "Season"}
        columns = [
            {"field": "coach", "label": "Coach"},
            {"field": "label", "label": "Label"},
            {"field": "start_day", "label": "Start day"},
            {"field": "start_month", "label": "Start month"},
            {"field": "end_day", "label": "End day"},
            {"field": "end_month", "label": "End month"},
            {"field": "needs_review", "label": "Needs review"},
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
                get_field("coach", "ManyToOne", label="Coach", related_model="Coach"),
                get_field("label", "Text", label="Label"),
                get_field("start_day", "Integer", label="Start day"),
                get_field("start_month", "Integer", label="Start month"),
                get_field("end_day", "Integer", label="End day"),
                get_field("end_month", "Integer", label="End month"),
                get_field("needs_review", "Boolean", label="Needs review"),
            ],
        )
        form.add_block(info_block)

        return form


class SeasonLegacy(db.Model):
    """Snapshot of the pre-PAD-82 `seasons` rows. Migration-written, never read
    by the app; kept as a model only so autogenerate does not try to drop it."""

    __tablename__ = "seasons_legacy"
    __table_args__ = {"extend_existing": True}

    id = Column(Integer, primary_key=True)
    coach_id = Column(Integer, nullable=True)
    name = Column(String(120), nullable=True)
    start_date = Column(Date, nullable=True)
    end_date = Column(Date, nullable=True)
    archived_at = Column(DateTime, nullable=True)
