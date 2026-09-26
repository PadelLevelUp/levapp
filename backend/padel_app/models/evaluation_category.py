from sqlalchemy import Boolean, Column, Integer, String, ForeignKey, Index, text
from sqlalchemy.orm import relationship

from padel_app.sql_db import db
from padel_app import model
from padel_app.tools.input_tools import Block, Field, Form


class EvaluationCategory(db.Model, model.Model):
    __tablename__ = "evaluation_categories"
    # PAD-273 (audit M14): uniqueness the domain implies, enforced by the database.
    __table_args__ = (
        Index("uq_evaluation_categories_coach_name", "coach_id", "name", unique=True),
        # PAD-363 (evaluations.competencies): a coach switches a catalogue entry on once.
        Index(
            "uq_evaluation_categories_coach_catalogue_key", "coach_id", "catalogue_key", unique=True,
            postgresql_where=text("catalogue_key IS NOT NULL"), sqlite_where=text("catalogue_key IS NOT NULL"),
        ),
        {"extend_existing": True},
    )

    page_title = "Evaluation Categories"
    model_name = "EvaluationCategory"

    id = Column(Integer, primary_key=True)

    coach_id = Column(
        Integer, ForeignKey("coaches.id", ondelete="CASCADE"), nullable=False
    )
    coach = relationship("Coach", back_populates="evaluation_categories")

    name = Column(String(100), nullable=False)
    scale_min = Column(Integer, default=1)
    scale_max = Column(Integer, default=5)
    # PAD-403 (evaluations.legacy-conversion rules 2, 3): the scale a legacy
    # category held before the 1-10 -> 1-5 conversion; NULL for every category
    # created afterwards. Written only by the migration; read by its downgrade.
    scale_min_before_conversion = Column(Integer, nullable=True)
    scale_max_before_conversion = Column(Integer, nullable=True)

    # PAD-363 (evaluations.competencies). `competency_group` NULL = a LEGACY
    # category: one made by the old editor or the import, and the only kind the
    # five endpoints App Store 1.0/1.1.0 call may list, accept, return or delete
    # (evaluations.legacy-client-contract, R-047). A catalogue competency is a row
    # created when the coach switches it on; `catalogue_key` names the entry.
    # Deliberately NOT in `get_create_form`: the form layer drops falsy values
    # (B-136), and `is_active=False` / `sort_order=0` are legitimate here.
    catalogue_key = Column(String(64), nullable=True)
    competency_group = Column(String(16), nullable=True)  # general | technique | tactics | custom
    is_active = Column(Boolean, nullable=False, default=True, server_default=text("true"))
    sort_order = Column(Integer, nullable=True)
    # PAD-431 (evaluations.competencies rule 15): the category a sub-category belongs to; NULL for a
    # category. Two levels only, and never on a legacy row — enforced by the service, not here.
    parent_id = Column(
        Integer, ForeignKey("evaluation_categories.id", ondelete="CASCADE"), nullable=True, index=True
    )

    entries = relationship(
        "EvaluationEntry", back_populates="category", cascade="all, delete-orphan",
        passive_deletes=True,
    )

    @property
    def is_legacy(self):
        return self.competency_group is None

    @property
    def display_name(self):
        return f"{self.name} ({self.scale_min}–{self.scale_max})"

    def __repr__(self):
        return f"<EvaluationCategory {self.coach.name}: {self.name}>"

    def __str__(self):
        return f"{self.coach.name} - {self.name}"

    @classmethod
    def display_all_info(cls):
        searchable = {"field": "name", "label": "Category"}
        columns = [
            {"field": "coach", "label": "Coach"},
            {"field": "name", "label": "Category"},
            {"field": "scale_min", "label": "Scale Min"},
            {"field": "scale_max", "label": "Scale Max"},
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
                get_field("name", "Text", label="Category name"),
                get_field("scale_min", "Integer", label="Scale min"),
                get_field("scale_max", "Integer", label="Scale max"),
            ],
        )
        form.add_block(info_block)

        return form
    
    def frontend_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'scaleMin': self.scale_min,
            'scaleMax': self.scale_max,
        }
