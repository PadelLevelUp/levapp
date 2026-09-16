"""PAD-129: per-series and per-class eligibility override tiers

Revision ID: cf91822dc181
Revises: ad97ec649746
Create Date: 2026-09-09

Adds ``lessons.eligibility_rules`` and ``lesson_instances.eligibility_rules``
(JSON, nullable) — eligibility.cascade rules 1–2. NULL means "no override at
this tier"; ``[]`` is a deliberate "everyone" override, so the column must be
nullable and the two values must round-trip distinctly.

Idempotent: each ADD COLUMN is skipped when the column already exists, so the
migration is safe on a prod-shaped database that may have been patched by
hand (see the prod-schema-drift note in the project memory).
"""
import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "cf91822dc181"
down_revision = "ad97ec649746"
branch_labels = None
depends_on = None

TABLES = ("lessons", "lesson_instances")
COLUMN = "eligibility_rules"


def _has_column(table: str) -> bool:
    inspector = sa.inspect(op.get_bind())
    return any(col["name"] == COLUMN for col in inspector.get_columns(table))


def upgrade():
    for table in TABLES:
        if not _has_column(table):
            op.add_column(table, sa.Column(COLUMN, sa.JSON(), nullable=True))


def downgrade():
    for table in TABLES:
        if _has_column(table):
            op.drop_column(table, COLUMN)
