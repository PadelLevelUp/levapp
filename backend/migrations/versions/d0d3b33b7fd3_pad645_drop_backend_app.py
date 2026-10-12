"""PAD-645: drop backend_app — the retired editor's app registry (PAD-550 deleted its last reader)

Revision ID: d0d3b33b7fd3
Revises: 6aef46eb1421
Create Date: 2026-10-12 14:40:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'd0d3b33b7fd3'
down_revision = '6aef46eb1421'
branch_labels = None
depends_on = None


def _has_table():
    return 'backend_app' in sa.inspect(op.get_bind()).get_table_names()


def upgrade():
    if _has_table():
        op.drop_table('backend_app')


def downgrade():
    # The table as e5442f6c568d created it, named the way Postgres named those unnamed
    # constraints on prod. Its rows are not restored.
    if _has_table():
        return
    op.create_table(
        'backend_app',
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('name', sa.String(length=80), nullable=False),
        sa.Column('app_model_name', sa.String(length=80), nullable=False),
        sa.Column('color', sa.String(length=10), nullable=True),
        sa.Column('image_id', sa.Integer(), nullable=True),
        sa.ForeignKeyConstraint(['image_id'], ['images.id'], name='backend_app_image_id_fkey', ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id', name='backend_app_pkey'),
        sa.UniqueConstraint('app_model_name', name='backend_app_app_model_name_key'),
        sa.UniqueConstraint('name', name='backend_app_name_key'),
    )
