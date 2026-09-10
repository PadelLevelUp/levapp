"""add class_requests (classes.class-requests, PAD-104)

Revision ID: e4b8c2d17a35
Revises: ad97ec649746
Create Date: 2026-09-10 02:30:00.000000

Idempotent: staging is a prod copy per deploy, so every step checks first.
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision = 'e4b8c2d17a35'
down_revision = 'ad97ec649746'
branch_labels = None
depends_on = None

STATUSES = ('pending', 'countered', 'accepted', 'declined', 'withdrawn')
DECIDERS = ('coach', 'student')

status_enum = sa.Enum(*STATUSES, name='class_request_status')
decider_enum = sa.Enum(*DECIDERS, name='class_request_decider')


def _col(enum, name):
    # Never emits CREATE TYPE itself; the type is created once in upgrade().
    return postgresql.ENUM(*enum.enums, name=name, create_type=False).with_variant(
        sa.Enum(*enum.enums, name=name), 'sqlite'
    )


def upgrade():
    bind = op.get_bind()
    status_enum.create(bind, checkfirst=True)
    decider_enum.create(bind, checkfirst=True)
    if not inspect(bind).has_table('class_requests'):
        op.create_table(
            'class_requests',
            sa.Column('id', sa.Integer(), primary_key=True),
            sa.Column('created_at', sa.DateTime(), nullable=True),
            sa.Column('updated_at', sa.DateTime(), nullable=True),
            sa.Column('player_id', sa.Integer(), sa.ForeignKey('players.id', ondelete='CASCADE'), nullable=False),
            sa.Column('coach_id', sa.Integer(), sa.ForeignKey('coaches.id', ondelete='CASCADE'), nullable=False),
            sa.Column('start_datetime', sa.DateTime(), nullable=False),
            sa.Column('end_datetime', sa.DateTime(), nullable=False),
            sa.Column('note', sa.Text(), nullable=True),
            sa.Column('status', _col(status_enum, 'class_request_status'), nullable=False, server_default='pending'),
            sa.Column('decided_by', _col(decider_enum, 'class_request_decider'), nullable=True),
            sa.Column('decided_at', sa.DateTime(), nullable=True),
            sa.Column('hold_block_id', sa.Integer(), sa.ForeignKey('calendar_blocks.id', ondelete='SET NULL'), nullable=True),
            sa.Column('lesson_id', sa.Integer(), sa.ForeignKey('lessons.id', ondelete='SET NULL'), nullable=True),
        )
    existing = {ix['name'] for ix in inspect(bind).get_indexes('class_requests')}
    for name, cols in (
        ('ix_class_requests_coach_id', ['coach_id']),
        ('ix_class_requests_player_id', ['player_id']),
        ('ix_class_requests_start_datetime', ['start_datetime']),
    ):
        if name not in existing:
            op.create_index(name, 'class_requests', cols)


def downgrade():
    bind = op.get_bind()
    if inspect(bind).has_table('class_requests'):
        op.drop_table('class_requests')
    decider_enum.drop(bind, checkfirst=True)
    status_enum.drop(bind, checkfirst=True)
