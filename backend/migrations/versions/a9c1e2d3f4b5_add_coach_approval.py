"""add coach approval (auth.coach-approval, PAD-210)

Revision ID: a9c1e2d3f4b5
Revises: f1a2b3c4d5e6
Create Date: 2026-09-06 18:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'a9c1e2d3f4b5'
down_revision = 'f1a2b3c4d5e6'
branch_labels = None
depends_on = None


coach_approval_status = sa.Enum(
    'pending', 'approved', 'rejected', name='coach_approval_status'
)


def upgrade():
    bind = op.get_bind()
    coach_approval_status.create(bind, checkfirst=True)
    op.add_column(
        'coaches',
        sa.Column(
            'approval_status',
            coach_approval_status,
            nullable=False,
            server_default='pending',
        ),
    )
    op.add_column('coaches', sa.Column('approved_at', sa.DateTime(), nullable=True))
    op.add_column('coaches', sa.Column('approved_by_user_id', sa.Integer(), nullable=True))
    op.add_column('coaches', sa.Column('rejection_reason', sa.Text(), nullable=True))
    op.create_foreign_key(
        'fk_coaches_approved_by_user_id_users',
        'coaches', 'users', ['approved_by_user_id'], ['id'], ondelete='SET NULL',
    )
    # Every coach that exists before this migration was created by a club
    # invitation or by hand: they are approved. Only coaches created from now
    # on by self-registration start pending.
    op.execute("UPDATE coaches SET approval_status = 'approved'")


def downgrade():
    op.drop_constraint('fk_coaches_approved_by_user_id_users', 'coaches', type_='foreignkey')
    op.drop_column('coaches', 'rejection_reason')
    op.drop_column('coaches', 'approved_by_user_id')
    op.drop_column('coaches', 'approved_at')
    op.drop_column('coaches', 'approval_status')
    coach_approval_status.drop(op.get_bind(), checkfirst=True)
