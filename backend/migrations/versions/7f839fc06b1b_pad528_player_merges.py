"""player_merges — the audit row of a placeholder merge (players.claim rule 5i, PAD-528)

Revision ID: 7f839fc06b1b
Revises: 0d2107f3fa7b
Create Date: 2026-10-07 19:40:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '7f839fc06b1b'
down_revision = '0d2107f3fa7b'
branch_labels = None
depends_on = None


def _has_table(name):
    bind = op.get_bind()
    return sa.inspect(bind).has_table(name)


def upgrade():
    # Idempotent: production drifts (B-062), and a re-run must not fail.
    if _has_table('player_merges'):
        return
    # sa.Enum inside create_table creates the Postgres type itself; do NOT also
    # call .create() on it (PAD-211).
    op.create_table(
        'player_merges',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.Column('placeholder_player_id', sa.Integer(), nullable=False),
        sa.Column('placeholder_user_id', sa.Integer(), sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True),
        sa.Column('target_player_id', sa.Integer(), sa.ForeignKey('players.id', ondelete='SET NULL'), nullable=True),
        sa.Column('target_user_id', sa.Integer(), sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True),
        sa.Column('requested_by_coach_id', sa.Integer(), sa.ForeignKey('coaches.id', ondelete='SET NULL'), nullable=True),
        sa.Column('confirmed_by_user_id', sa.Integer(), sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True),
        sa.Column(
            'trigger',
            sa.Enum('invite_link', 'coach_request', name='player_merge_trigger'),
            nullable=False,
        ),
        sa.Column('counts', sa.JSON(), nullable=False, server_default='{}'),
    )
    op.create_index('ix_player_merges_placeholder_player_id', 'player_merges', ['placeholder_player_id'])
    op.create_index('ix_player_merges_target_player_id', 'player_merges', ['target_player_id'])


def downgrade():
    if _has_table('player_merges'):
        op.drop_index('ix_player_merges_target_player_id', table_name='player_merges')
        op.drop_index('ix_player_merges_placeholder_player_id', table_name='player_merges')
        op.drop_table('player_merges')
    sa.Enum(name='player_merge_trigger').drop(op.get_bind(), checkfirst=True)
