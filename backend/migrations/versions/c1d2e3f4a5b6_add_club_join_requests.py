"""add club_join_requests (clubs.join-request, PAD-211)

Revision ID: c1d2e3f4a5b6
Revises: b7c8d9e0f1a2
Create Date: 2026-09-07 00:30:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'c1d2e3f4a5b6'
down_revision = 'b7c8d9e0f1a2'
branch_labels = None
depends_on = None


club_join_request_status = sa.Enum(
    'pending', 'approved', 'rejected', 'withdrawn', name='club_join_request_status'
)


def upgrade():
    bind = op.get_bind()
    club_join_request_status.create(bind, checkfirst=True)
    op.create_table(
        'club_join_requests',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.Column(
            'club_id', sa.Integer(),
            sa.ForeignKey('clubs.id', ondelete='CASCADE'), nullable=False,
        ),
        sa.Column(
            'coach_id', sa.Integer(),
            sa.ForeignKey('coaches.id', ondelete='CASCADE'), nullable=False,
        ),
        sa.Column(
            'status', club_join_request_status,
            nullable=False, server_default='pending',
        ),
        sa.Column('requested_at', sa.DateTime(), nullable=False),
        sa.Column('decided_at', sa.DateTime(), nullable=True),
        sa.Column(
            'decided_by_coach_id', sa.Integer(),
            sa.ForeignKey('coaches.id', ondelete='SET NULL'), nullable=True,
        ),
    )
    op.create_index(
        'ix_club_join_requests_club_id', 'club_join_requests', ['club_id']
    )
    op.create_index(
        'ix_club_join_requests_coach_id', 'club_join_requests', ['coach_id']
    )
    # One *pending* request per (club, coach); decided ones may accumulate.
    op.create_index(
        'uq_club_join_request_pending',
        'club_join_requests',
        ['club_id', 'coach_id'],
        unique=True,
        postgresql_where=sa.text("status = 'pending'"),
    )


def downgrade():
    op.drop_index('uq_club_join_request_pending', table_name='club_join_requests')
    op.drop_index('ix_club_join_requests_coach_id', table_name='club_join_requests')
    op.drop_index('ix_club_join_requests_club_id', table_name='club_join_requests')
    op.drop_table('club_join_requests')
    club_join_request_status.drop(op.get_bind(), checkfirst=True)
