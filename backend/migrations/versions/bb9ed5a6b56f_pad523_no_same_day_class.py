"""PAD-523: the coach's "do not invite a student who already has a class that day" restriction

Revision ID: bb9ed5a6b56f
Revises: 0d2107f3fa7b
Create Date: 2026-10-07

Adds ``no_same_day_class_enabled`` (Boolean, NOT NULL, server default false) to
``notification_configs`` (notifications.config rule 6e). Off for every existing coach: the column
default is the value they get, and nothing is backfilled (compass: a new marker's default must be
off). Idempotent: the column is added only when absent.
"""
import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "bb9ed5a6b56f"
down_revision = "0d2107f3fa7b"
branch_labels = None
depends_on = None

TABLE = "notification_configs"
COLUMN = "no_same_day_class_enabled"


def _has_column() -> bool:
    inspector = sa.inspect(op.get_bind())
    return any(col["name"] == COLUMN for col in inspector.get_columns(TABLE))


def upgrade():
    if not _has_column():
        op.add_column(
            TABLE,
            sa.Column(COLUMN, sa.Boolean(), nullable=False, server_default=sa.text("false")),
        )


def downgrade():
    if _has_column():
        op.drop_column(TABLE, COLUMN)
