"""PAD-130: open-spot visibility toggle, coach standard plus two override tiers

Revision ID: 94b353eb8531
Revises: cf91822dc181
Create Date: 2026-09-09

Adds ``open_spots_visible`` (Boolean, nullable) to ``notification_configs``,
``lessons`` and ``lesson_instances`` — eligibility.open-spot-visibility rules
3 and 10. NULL on the lesson/instance tiers means "inherit"; the coach tier
defaults to off. Idempotent: each ADD COLUMN is skipped when it already exists.
"""
import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "94b353eb8531"
down_revision = "cf91822dc181"
branch_labels = None
depends_on = None

TABLES = ("notification_configs", "lessons", "lesson_instances")
COLUMN = "open_spots_visible"


def _has_column(table: str) -> bool:
    inspector = sa.inspect(op.get_bind())
    return any(col["name"] == COLUMN for col in inspector.get_columns(table))


def upgrade():
    for table in TABLES:
        if not _has_column(table):
            op.add_column(table, sa.Column(COLUMN, sa.Boolean(), nullable=True))


def downgrade():
    for table in TABLES:
        if _has_column(table):
            op.drop_column(table, COLUMN)
