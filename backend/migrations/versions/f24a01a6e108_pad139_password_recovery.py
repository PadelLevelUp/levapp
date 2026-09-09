"""add password recovery columns (auth.password-recovery, PAD-139)

Revision ID: f24a01a6e108
Revises: c0f7ac795cbd
Create Date: 2026-09-09 16:30:00.000000

Every DDL statement is guarded: prod carries unmigrated hand-made schema and
staging is a copy of prod per deploy, so a column may already exist when this
runs (see the prod-schema-drift note in the migrations README).
"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'f24a01a6e108'
down_revision = 'c0f7ac795cbd'
branch_labels = None
depends_on = None


COLUMNS = (
    sa.Column('password_reset_code_hash', sa.String(length=128), nullable=True),
    sa.Column('password_reset_expires_at', sa.DateTime(), nullable=True),
    sa.Column('password_reset_sent_at', sa.DateTime(), nullable=True),
    sa.Column('password_reset_attempts', sa.Integer(), nullable=False, server_default='0'),
)


def _existing_columns():
    return {c['name'] for c in sa.inspect(op.get_bind()).get_columns('users')}


def upgrade():
    existing = _existing_columns()
    for column in COLUMNS:
        if column.name not in existing:
            op.add_column('users', column)


def downgrade():
    existing = _existing_columns()
    for column in reversed(COLUMNS):
        if column.name in existing:
            op.drop_column('users', column.name)
