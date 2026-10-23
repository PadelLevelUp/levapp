"""accept join requests automatically (PAD-672 slice 2)

Revision ID: bd9540d946e7
Revises: 6988ec068d41
Create Date: 2026-10-21 22:45:00.000000

notifications.config rule 3a: `notification_configs.auto_accept_join_requests`, boolean, NOT NULL,
default false (owner Q3: off by default). Every existing coach reads false, which is today's
behaviour. Guarded, so a second run changes nothing.
"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'bd9540d946e7'
down_revision = '6988ec068d41'  # PAD-672 slice 1
branch_labels = None
depends_on = None

TABLE = "notification_configs"
COLUMN = "auto_accept_join_requests"


def _has_column():
    return COLUMN in {c["name"] for c in sa.inspect(op.get_bind()).get_columns(TABLE)}


def upgrade():
    if not _has_column():
        op.add_column(TABLE, sa.Column(COLUMN, sa.Boolean(), nullable=False, server_default=sa.text("false")))


def downgrade():
    if not _has_column():
        return
    if op.get_bind().dialect.name == "sqlite":
        with op.batch_alter_table(TABLE) as batch:
            batch.drop_column(COLUMN)
    else:
        op.drop_column(TABLE, COLUMN)
