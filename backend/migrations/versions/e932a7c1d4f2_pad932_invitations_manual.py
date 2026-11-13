"""PAD-932: invitations.manual marks a coach's invitation by hand (notifications.engine-answers rule 15).

A manual invitation on a new-engine class is an engine invitation of the coach's-list tier; the class
detail lists it with no tier source (calendar.event-detail ND1) and its bubble is a plain invite. Every
existing row is automatic, so the column defaults to false; no row is rewritten.

Revision ID: e932a7c1d4f2
Revises: d921b2c3e4f5
Create Date: 2026-11-13 14:30:00.000000
"""
from alembic import op
import sqlalchemy as sa


revision = "e932a7c1d4f2"
down_revision = "d921b2c3e4f5"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("invitations") as batch_op:
        batch_op.add_column(sa.Column("manual", sa.Boolean(), nullable=False, server_default=sa.text("false")))


def downgrade():
    with op.batch_alter_table("invitations") as batch_op:
        batch_op.drop_column("manual")
