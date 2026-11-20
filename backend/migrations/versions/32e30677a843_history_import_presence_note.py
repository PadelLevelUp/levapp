"""History import D4: ``presences.note`` (attendance.presence rule 11).

A nullable text note per student per occurrence, written by the onboarding history import from the
coach's own observations. Nothing reads it and no payload carries it yet.

- Upgrade: adds the column when it is not there.
- Downgrade: drops it.

Revision ID: 32e30677a843
Revises: 3696b022341c
Create Date: 2026-11-19 19:45:00.000000
"""
from alembic import op
import sqlalchemy as sa


revision = "32e30677a843"
down_revision = "3696b022341c"
branch_labels = None
depends_on = None


def _has_note(bind) -> bool:
    return "note" in {c["name"] for c in sa.inspect(bind).get_columns("presences")}


def upgrade():
    if not _has_note(op.get_bind()):
        op.add_column("presences", sa.Column("note", sa.Text(), nullable=True))


def downgrade():
    if _has_note(op.get_bind()):
        with op.batch_alter_table("presences") as batch:
            batch.drop_column("note")
