"""PAD-685: "do not invite a student who already has a class that day" comes on by default

Revision ID: c6203aa9b167
Revises: 741b857a286c
Create Date: 2026-10-21

notifications.config rule 6e (PAD-685, owner decision 2026-10-20: the restriction must come on by
default). Sets the server default of ``notification_configs.no_same_day_class_enabled`` to true and
switches EVERY existing row on. Every row, because the stored ``false`` cannot tell a coach who
never touched the setting from one who deliberately switched it off (NOT NULL, no backfill, and
``updated_at`` moves with any save of the section); the owner chose to switch all coaches on once.
The coach can still switch it off afterwards, and that off is kept.

Idempotent: a second run finds nothing to change. Downgrade restores only the old server default
(false); it does NOT flip data back, since the pre-migration values are not recoverable.
"""
import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "c6203aa9b167"
down_revision = "741b857a286c"
branch_labels = None
depends_on = None

TABLE = "notification_configs"
COLUMN = "no_same_day_class_enabled"


def _has_column() -> bool:
    inspector = sa.inspect(op.get_bind())
    return any(col["name"] == COLUMN for col in inspector.get_columns(TABLE))


def upgrade():
    if not _has_column():
        return
    with op.batch_alter_table(TABLE) as batch:
        batch.alter_column(COLUMN, existing_type=sa.Boolean(), existing_nullable=False,
                           server_default=sa.text("true"))
    op.execute(f"UPDATE {TABLE} SET {COLUMN} = true WHERE {COLUMN} IS DISTINCT FROM true")


def downgrade():
    if not _has_column():
        return
    with op.batch_alter_table(TABLE) as batch:
        batch.alter_column(COLUMN, existing_type=sa.Boolean(), existing_nullable=False,
                           server_default=sa.text("false"))
