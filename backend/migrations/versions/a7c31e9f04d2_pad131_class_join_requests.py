"""add class_join_requests (classes.join-requests, PAD-131)

Revision ID: a7c31e9f04d2
Revises: 94b353eb8531
Create Date: 2026-09-10 01:40:00.000000

Idempotent: every step checks the inspector first, because staging is a prod
copy per deploy and prod may already carry part of this schema.
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision = 'a7c31e9f04d2'
down_revision = '94b353eb8531'
branch_labels = None
depends_on = None

STATUSES = ('pending', 'accepted', 'rejected', 'withdrawn', 'superseded')

class_join_request_status = sa.Enum(*STATUSES, name='class_join_request_status')

# Column-level type that never emits CREATE TYPE itself (the club_join_requests
# precedent): the type is created once, explicitly, in upgrade().
class_join_request_status_col = postgresql.ENUM(
    *STATUSES, name='class_join_request_status', create_type=False,
).with_variant(
    sa.Enum(*STATUSES, name='class_join_request_status'), 'sqlite',
)


def upgrade():
    bind = op.get_bind()
    insp = inspect(bind)
    class_join_request_status.create(bind, checkfirst=True)
    if not insp.has_table('class_join_requests'):
        op.create_table(
            'class_join_requests',
            sa.Column('id', sa.Integer(), primary_key=True),
            sa.Column(
                'lesson_instance_id', sa.Integer(),
                sa.ForeignKey('lesson_instances.id', ondelete='CASCADE'), nullable=False,
            ),
            sa.Column(
                'player_id', sa.Integer(),
                sa.ForeignKey('players.id', ondelete='CASCADE'), nullable=False,
            ),
            sa.Column(
                'coach_id', sa.Integer(),
                sa.ForeignKey('coaches.id', ondelete='CASCADE'), nullable=False,
            ),
            sa.Column(
                'status', class_join_request_status_col,
                nullable=False, server_default='pending',
            ),
            sa.Column('created_at', sa.DateTime(), nullable=False),
            # The editor Model mixin selects `updated_at` on every model.
            sa.Column('updated_at', sa.DateTime(), nullable=True),
            sa.Column('decided_at', sa.DateTime(), nullable=True),
            sa.Column(
                'decided_by_coach_id', sa.Integer(),
                sa.ForeignKey('coaches.id', ondelete='SET NULL'), nullable=True,
            ),
        )
    columns = {c['name'] for c in inspect(bind).get_columns('class_join_requests')}
    if 'updated_at' not in columns:
        op.add_column('class_join_requests', sa.Column('updated_at', sa.DateTime(), nullable=True))
    existing = {ix['name'] for ix in inspect(bind).get_indexes('class_join_requests')}
    if 'ix_class_join_requests_lesson_instance_id' not in existing:
        op.create_index(
            'ix_class_join_requests_lesson_instance_id', 'class_join_requests', ['lesson_instance_id']
        )
    if 'ix_class_join_requests_player_id' not in existing:
        op.create_index('ix_class_join_requests_player_id', 'class_join_requests', ['player_id'])
    if 'ix_class_join_requests_coach_id' not in existing:
        op.create_index('ix_class_join_requests_coach_id', 'class_join_requests', ['coach_id'])
    if 'uq_class_join_request_pending' not in existing:
        # One *pending* request per (class, player); decided ones may accumulate.
        op.create_index(
            'uq_class_join_request_pending',
            'class_join_requests',
            ['lesson_instance_id', 'player_id'],
            unique=True,
            postgresql_where=sa.text("status = 'pending'"),
        )


def downgrade():
    bind = op.get_bind()
    if inspect(bind).has_table('class_join_requests'):
        op.drop_table('class_join_requests')
    class_join_request_status.drop(bind, checkfirst=True)
