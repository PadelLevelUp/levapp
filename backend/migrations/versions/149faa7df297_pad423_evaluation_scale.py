"""PAD-423 (evaluations.scale, D147): the scale each score was given on, and the coach's scale.

1. `evaluation_entries.scale_min` / `scale_max` (Integer, nullable): the scale a score was given
   on (rule 3). Backfilled from the entry's category for every entry that has none yet, so a
   second run is a no-op; `score` is never touched.
2. `notification_configs.evaluation_scale_max` (Integer, NOT NULL, server default 5): the coach's
   scale (rule 1). 5 changes nothing for a coach who never sets it.

Every DDL statement is guarded (the column is added only if absent, dropped only if present), so
the migration is idempotent on a database that drifted (memory prod-schema-drift).

Revision ID: 149faa7df297
Revises: e25428020888
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect as sa_inspect

revision = "149faa7df297"
down_revision = "e25428020888"  # PAD-403
branch_labels = None
depends_on = None


def _has_column(table, name):
    return any(c["name"] == name for c in sa_inspect(op.get_bind()).get_columns(table))


def upgrade():
    for name in ("scale_min", "scale_max"):
        if not _has_column("evaluation_entries", name):
            op.add_column("evaluation_entries", sa.Column(name, sa.Integer(), nullable=True))
    if not _has_column("notification_configs", "evaluation_scale_max"):
        op.add_column(
            "notification_configs",
            sa.Column("evaluation_scale_max", sa.Integer(), nullable=False, server_default="5"),
        )
    # Each existing score was given on its category's scale; fill only what is still NULL.
    op.execute(
        sa.text(
            "UPDATE evaluation_entries SET scale_min = c.scale_min, scale_max = c.scale_max "
            "FROM evaluation_categories c "
            "WHERE evaluation_entries.category_id = c.id AND evaluation_entries.scale_max IS NULL"
        )
    )


def downgrade():
    if _has_column("notification_configs", "evaluation_scale_max"):
        op.drop_column("notification_configs", "evaluation_scale_max")
    for name in ("scale_max", "scale_min"):
        if _has_column("evaluation_entries", name):
            op.drop_column("evaluation_entries", name)
