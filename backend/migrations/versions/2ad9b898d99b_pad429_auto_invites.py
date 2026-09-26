"""PAD-429: a per-class automatic-invitations override

Revision ID: 2ad9b898d99b
Revises: e25428020888
Create Date: 2026-09-25

Adds ``auto_invites`` (Boolean, nullable) to ``lessons`` and ``lesson_instances``:
notifications.toggle-class rules 5–7. NULL means "inherit", resolved instance → lesson → the
lesson's type (private off, academy on) at read time. No row is written: existing private
lessons get the default, and nothing is backfilled (coordinator, 2026-09-25, option a).
Idempotent: each ADD COLUMN is skipped when it already exists.
"""
import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "2ad9b898d99b"
down_revision = "e25428020888"
branch_labels = None
depends_on = None

TABLES = ("lessons", "lesson_instances")
COLUMN = "auto_invites"


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
