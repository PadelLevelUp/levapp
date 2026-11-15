"""PAD-967: who answered a new-engine invitation (invitations.answered_by).

The engine's Answered carries ``by`` ("student" | "coach"); the store keeps it on the invitation, for
the class detail's invitee row (calendar.event-detail ND1) and the bubble's answered state
(notifications.invitations NB1). Only adds a nullable column.

Revision ID: c967a1b2d3e4
Revises: b916e0a1c2d3
Create Date: 2026-11-12 17:00:00.000000
"""
from alembic import op
import sqlalchemy as sa


revision = "c967a1b2d3e4"
down_revision = "b916e0a1c2d3"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("invitations") as batch_op:
        batch_op.add_column(sa.Column("answered_by", sa.String(length=7), nullable=True))


def downgrade():
    with op.batch_alter_table("invitations") as batch_op:
        batch_op.drop_column("answered_by")
