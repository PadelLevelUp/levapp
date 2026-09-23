from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Index, Integer, JSON, String
from sqlalchemy.orm import backref, relationship

from padel_app.sql_db import db
from padel_app import model


class EvaluationShare(db.Model, model.Model):
    """PAD-402 (evaluations.sharing): the one share a coach has sent a player for
    an evaluation record — at most one per `evaluation_records.id`, enforced by
    `uq_evaluation_shares_record_id`. `card` is the snapshot the player is served
    and is never recomputed once written (evaluations.sharing rule 7). `shared_at`
    is a naive-UTC instant the service sets explicitly at share time — this column
    carries no default.
    """

    __tablename__ = "evaluation_shares"
    # The migration (6a6ac64d814b) creates a unique INDEX by this name, not a
    # unique constraint — declare it the same way so `flask db check` sees no drift.
    __table_args__ = (Index("uq_evaluation_shares_record_id", "record_id", unique=True),)

    id = Column(Integer, primary_key=True)

    record_id = Column(
        Integer, ForeignKey("evaluation_records.id", ondelete="CASCADE"), nullable=False
    )
    record = relationship(
        "EvaluationRecord",
        backref=backref("share", uselist=False, cascade="all, delete-orphan", passive_deletes=True),
    )

    shared_at = Column(DateTime, nullable=False)
    category_ids = Column(JSON, nullable=False)
    evolution = Column(String(8), nullable=False)
    include_note = Column(Boolean, nullable=False)
    card = Column(JSON, nullable=False)
