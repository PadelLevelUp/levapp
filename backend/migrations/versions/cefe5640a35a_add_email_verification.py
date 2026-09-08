"""add email verification (auth.email-verification, PAD-234)

Revision ID: cefe5640a35a
Revises: a5b6c7d8e9f0
Create Date: 2026-09-07 18:00:00.000000

Every DDL statement is guarded: prod carries unmigrated hand-made schema and
staging is a copy of prod per deploy, so a column may already exist when this
runs (see the prod-schema-drift note in the migrations README).
"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'cefe5640a35a'
down_revision = 'a5b6c7d8e9f0'
branch_labels = None
depends_on = None


COLUMNS = (
    sa.Column('email_verification_required', sa.Boolean(), nullable=False, server_default=sa.text('false')),
    sa.Column('email_verified_at', sa.DateTime(), nullable=True),
    sa.Column('email_verification_code_hash', sa.String(length=128), nullable=True),
    sa.Column('email_verification_expires_at', sa.DateTime(), nullable=True),
    sa.Column('email_verification_sent_at', sa.DateTime(), nullable=True),
    sa.Column('email_verification_attempts', sa.Integer(), nullable=False, server_default='0'),
)


def _existing_columns():
    return {c['name'] for c in sa.inspect(op.get_bind()).get_columns('users')}


def upgrade():
    existing = _existing_columns()
    added = []
    for column in COLUMNS:
        if column.name not in existing:
            op.add_column('users', column)
            added.append(column.name)
    # Everyone who has an email today was onboarded by hand or by an invite
    # before verification existed: they are verified. Only accounts created
    # from now on by self-signup (or that change their email) start pending.
    if 'email_verified_at' in added:
        op.execute(
            "UPDATE users SET email_verified_at = NOW() AT TIME ZONE 'UTC' "
            "WHERE email IS NOT NULL AND email_verified_at IS NULL"
        )


def downgrade():
    existing = _existing_columns()
    for column in reversed(COLUMNS):
        if column.name in existing:
            op.drop_column('users', column.name)
