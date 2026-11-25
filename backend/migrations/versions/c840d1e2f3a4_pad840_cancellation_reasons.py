"""PAD-840: ``lessons.cancellation_reasons`` (classes.delete rule 11).

A nullable JSON list: the reasons of the removals a class survived.

- Upgrade: adds the column when it is not there.
- Downgrade: drops it.

Revision ID: c840d1e2f3a4
Revises: b753c2d3e4f5
Create Date: 2026-11-25 11:30:00.000000
"""
from alembic import op
import sqlalchemy as sa


revision = "c840d1e2f3a4"
down_revision = "b753c2d3e4f5"
branch_labels = None
depends_on = None


def _has_column(bind) -> bool:
    return "cancellation_reasons" in {c["name"] for c in sa.inspect(bind).get_columns("lessons")}


def upgrade():
    if not _has_column(op.get_bind()):
        op.add_column("lessons", sa.Column("cancellation_reasons", sa.JSON(), nullable=True))


def downgrade():
    if _has_column(op.get_bind()):
        with op.batch_alter_table("lessons") as batch:
            batch.drop_column("cancellation_reasons")
