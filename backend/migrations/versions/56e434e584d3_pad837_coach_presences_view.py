"""PAD-837b: coaches.presences_view — the coach's saved Presences columns.

One nullable JSON column (settings.coach-presences-view; NULL = not set, the shells show
the column list's defaults), guarded so a re-run is a no-op and a hand-applied column is
left alone. No data changes. Downgrade drops it.

Revision ID: 56e434e584d3
Revises: e830f1a2b3c4
Create Date: 2026-11-15
"""
import logging

import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect as sa_inspect

revision = "56e434e584d3"
down_revision = "e830f1a2b3c4"
branch_labels = None
depends_on = None

log = logging.getLogger("alembic.runtime.migration")


def _has_column():
    return any(c["name"] == "presences_view" for c in sa_inspect(op.get_bind()).get_columns("coaches"))


def upgrade():
    if _has_column():
        log.info("PAD-837b: coaches.presences_view already present — skipping")
        return
    op.add_column("coaches", sa.Column("presences_view", sa.JSON(), nullable=True))


def downgrade():
    if not _has_column():
        return
    if op.get_bind().dialect.name == "sqlite":
        with op.batch_alter_table("coaches") as batch:
            batch.drop_column("presences_view")
    else:
        op.drop_column("coaches", "presences_view")
