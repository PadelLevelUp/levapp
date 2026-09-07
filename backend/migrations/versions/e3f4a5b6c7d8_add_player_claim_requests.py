"""add player_claim_requests (players.claim, PAD-213)

Revision ID: e3f4a5b6c7d8
Revises: d2e3f4a5b6c7
Create Date: 2026-09-07 10:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'e3f4a5b6c7d8'
down_revision = 'd2e3f4a5b6c7'
branch_labels = None
depends_on = None


def upgrade():
    # sa.Enum inside create_table creates the Postgres type itself; do NOT also
    # call .create() on it (that double-creates the type — seen on PAD-211).
    op.create_table(
        'player_claim_requests',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.Column('player_id', sa.Integer(), sa.ForeignKey('players.id', ondelete='CASCADE'), nullable=False),
        sa.Column('target_user_id', sa.Integer(), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('requested_by_coach_id', sa.Integer(), sa.ForeignKey('coaches.id', ondelete='SET NULL'), nullable=True),
        sa.Column(
            'status',
            sa.Enum('pending', 'accepted', 'rejected', 'revoked', name='player_claim_request_status'),
            nullable=False, server_default='pending',
        ),
        sa.Column('decided_at', sa.DateTime(), nullable=True),
    )
    op.create_index('ix_player_claim_requests_player_id', 'player_claim_requests', ['player_id'])
    op.create_index('ix_player_claim_requests_target_user_id', 'player_claim_requests', ['target_user_id'])
    # One pending request per placeholder player. Partial index: Postgres only;
    # the service enforces the same rule so SQLite tests behave identically.
    op.create_index(
        'uq_player_claim_request_pending', 'player_claim_requests', ['player_id'],
        unique=True, postgresql_where=sa.text("status = 'pending'"),
    )


def downgrade():
    op.drop_index('uq_player_claim_request_pending', table_name='player_claim_requests')
    op.drop_index('ix_player_claim_requests_target_user_id', table_name='player_claim_requests')
    op.drop_index('ix_player_claim_requests_player_id', table_name='player_claim_requests')
    op.drop_table('player_claim_requests')
    sa.Enum(name='player_claim_request_status').drop(op.get_bind(), checkfirst=True)
