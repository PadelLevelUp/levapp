"""PAD-921: invitations.closed_reason takes "class_removed" (notifications.invitations, INVITATIONS-125).

A removed or cancelled class closes its invitations with closed_reason "class_removed" (13 characters);
the column was String(10). Widened to String(16); no row is rewritten.

Revision ID: d921b2c3e4f5
Revises: c967a1b2d3e4
Create Date: 2026-11-12 19:00:00.000000
"""
from alembic import op
import sqlalchemy as sa


revision = "d921b2c3e4f5"
down_revision = "c967a1b2d3e4"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("invitations") as batch_op:
        batch_op.alter_column("closed_reason", existing_type=sa.String(length=10), type_=sa.String(length=16),
                              existing_nullable=True)


def downgrade():
    with op.batch_alter_table("invitations") as batch_op:
        batch_op.alter_column("closed_reason", existing_type=sa.String(length=16), type_=sa.String(length=10),
                              existing_nullable=True)
