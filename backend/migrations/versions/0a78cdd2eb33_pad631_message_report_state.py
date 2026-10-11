"""PAD-631: message_reports gains its review state (status, outcome, closed_at, closed_by)

Revision ID: 0a78cdd2eb33
Revises: 661763c8e361
Create Date: 2026-10-11 20:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '0a78cdd2eb33'
down_revision = '661763c8e361'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('message_reports') as batch:
        batch.add_column(sa.Column('status', sa.String(length=16), nullable=False, server_default='open'))
        batch.add_column(sa.Column('outcome', sa.String(length=24), nullable=True))
        batch.add_column(sa.Column('closed_at', sa.DateTime(), nullable=True))
        batch.add_column(sa.Column('closed_by', sa.String(length=255), nullable=True))
        batch.create_index('ix_message_reports_status', ['status'], unique=False)


def downgrade():
    with op.batch_alter_table('message_reports') as batch:
        batch.drop_index('ix_message_reports_status')
        batch.drop_column('closed_by')
        batch.drop_column('closed_at')
        batch.drop_column('outcome')
        batch.drop_column('status')
