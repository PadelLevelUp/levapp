"""PAD-534: delivery_incidents (admin.engine-health)

Revision ID: e33b118e4205
Revises: e4381787870f
Create Date: 2026-10-08

One table, created only when absent (idempotent): failed emails and pushes and reminders skipped
past due, kept 30 days by the `prune_delivery_incidents` job. No backfill: failures before this
were only in the logs.
"""
import sqlalchemy as sa
from alembic import op

revision = "e33b118e4205"
down_revision = "e4381787870f"
branch_labels = None
depends_on = None

TABLE = "delivery_incidents"


def _exists() -> bool:
    return TABLE in sa.inspect(op.get_bind()).get_table_names()


def upgrade():
    if _exists():
        return
    op.create_table(
        TABLE,
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.Column("kind", sa.String(length=32), nullable=False),
        sa.Column("channel", sa.String(length=16), nullable=False),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("subject_type", sa.String(length=32), nullable=True),
        sa.Column("subject_id", sa.Integer(), nullable=True),
        sa.Column("error_class", sa.String(length=120), nullable=True),
        sa.Column("detail", sa.String(length=500), nullable=True),
    )
    op.create_index("ix_delivery_incidents_created_at", TABLE, ["created_at"])
    op.create_index("ix_delivery_incidents_kind", TABLE, ["kind"])


def downgrade():
    if _exists():
        op.drop_table(TABLE)
