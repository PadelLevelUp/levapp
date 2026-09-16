"""PAD-232: users.notif_request_alerts — per-user opt-out for request alerts.

Idempotent (prod carries unmigrated drift; guard every DDL): adds the column only
when it is missing. Default true — everyone hears about requests unless they
switch it off.

Revision ID: 874c1724e2cf
Revises: ad97ec649746
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = '874c1724e2cf'
down_revision = 'ad97ec649746'
branch_labels = None
depends_on = None

COLUMN = 'notif_request_alerts'


def _existing_columns(bind):
    return {col['name'] for col in sa.inspect(bind).get_columns('users')}


def upgrade():
    bind = op.get_bind()
    if COLUMN in _existing_columns(bind):
        return
    with op.batch_alter_table('users') as batch_op:
        batch_op.add_column(
            sa.Column(
                COLUMN,
                sa.Boolean(),
                nullable=False,
                server_default=sa.text('true'),
            )
        )


def downgrade():
    bind = op.get_bind()
    if COLUMN not in _existing_columns(bind):
        return
    with op.batch_alter_table('users') as batch_op:
        batch_op.drop_column(COLUMN)
