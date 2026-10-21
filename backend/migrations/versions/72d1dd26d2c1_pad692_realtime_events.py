"""add realtime_events (messaging.sse-realtime rules 21-24, PAD-692)

Revision ID: 72d1dd26d2c1
Revises: 741b857a286c
Create Date: 2026-10-21 20:30:00.000000

Idempotent: staging is a prod copy per deploy, so every step checks first. Creates an empty table:
no data is touched, so it costs a catalog write on any database size.
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


# revision identifiers, used by Alembic.
revision = '72d1dd26d2c1'
down_revision = '741b857a286c'
branch_labels = None
depends_on = None


def upgrade():
    bind = op.get_bind()
    if not inspect(bind).has_table('realtime_events'):
        op.create_table(
            'realtime_events',
            sa.Column('id', sa.BigInteger().with_variant(sa.Integer(), 'sqlite'), primary_key=True),
            sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
            sa.Column('user_ids', sa.Text(), nullable=False),
            sa.Column('body', sa.Text(), nullable=False),
        )
    existing = {ix['name'] for ix in inspect(bind).get_indexes('realtime_events')}
    if 'ix_realtime_events_created_at' not in existing:
        op.create_index('ix_realtime_events_created_at', 'realtime_events', ['created_at'])


def downgrade():
    bind = op.get_bind()
    if inspect(bind).has_table('realtime_events'):
        op.drop_table('realtime_events')
