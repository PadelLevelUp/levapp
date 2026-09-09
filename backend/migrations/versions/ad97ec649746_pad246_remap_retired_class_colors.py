"""PAD-246: remap the four retired class swatches to status-safe hues

Revision ID: ad97ec649746
Revises: c0f7ac795cbd
Create Date: 2026-09-08

Data-only. The coach's colour identifies a class and must not look like a
status, so red / orange / yellow / green left the picker
(calendar.mobile-views rule 6). Stored values move once; anything that is
not one of the four retired hexes is left alone, so re-running is a no-op.
Safe on a prod-shaped database: a plain UPDATE per pair, no DDL.
"""
import sqlalchemy as sa
from alembic import op

# Mirrors padel_app/tools/class_colors.py, inlined so the migration never
# imports application code (Alembic runs it outside the app package path).
RETIRED_CLASS_COLOR_REMAP = {
    "#ef4444": "#A21CAF",
    "#f97316": "#0891B2",
    "#eab308": "#0D9488",
    "#22c55e": "#0D9488",
}

# revision identifiers, used by Alembic.
revision = "ad97ec649746"
down_revision = "c0f7ac795cbd"
branch_labels = None
depends_on = None


def apply_remap(connection):
    """Run the UPDATEs on an open connection. Idempotent."""
    for old, new in RETIRED_CLASS_COLOR_REMAP.items():
        connection.execute(
            sa.text("UPDATE lessons SET color = :new WHERE lower(color) = :old"),
            {"new": new, "old": old},
        )


def upgrade():
    apply_remap(op.get_bind())


def downgrade():
    # The retired hues are not restored: the picker no longer offers them and
    # nothing depends on a class having been red or green.
    pass
