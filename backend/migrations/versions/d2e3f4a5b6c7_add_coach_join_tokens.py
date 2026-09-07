"""add coach_join_tokens (players.join-token, PAD-212)

Revision ID: d2e3f4a5b6c7
Revises: b7c8d9e0f1a2
Create Date: 2026-09-07 09:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'd2e3f4a5b6c7'
down_revision = 'b7c8d9e0f1a2'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'coach_join_tokens',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.Column('coach_id', sa.Integer(), sa.ForeignKey('coaches.id', ondelete='CASCADE'), nullable=False),
        sa.Column('club_id', sa.Integer(), sa.ForeignKey('clubs.id', ondelete='CASCADE'), nullable=False),
        sa.Column('token', sa.String(length=64), nullable=False),
        sa.Column('expires_at', sa.DateTime(), nullable=False),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column('uses', sa.Integer(), nullable=False, server_default='0'),
    )
    op.create_index('ix_coach_join_tokens_token', 'coach_join_tokens', ['token'], unique=True)
    op.create_index('ix_coach_join_tokens_coach_id', 'coach_join_tokens', ['coach_id'])


def downgrade():
    op.drop_index('ix_coach_join_tokens_coach_id', table_name='coach_join_tokens')
    op.drop_index('ix_coach_join_tokens_token', table_name='coach_join_tokens')
    op.drop_table('coach_join_tokens')
