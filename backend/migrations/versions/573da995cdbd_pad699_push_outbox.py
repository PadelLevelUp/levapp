"""PAD-699: push_outbox, the push queue in Postgres (messaging.push-notifications rule 10a).

Created only when absent (prod and staging drift: migrations must be idempotent). updated_at as every
new table (ledger rule). The downgrade drops it; rows still pending are pushes not sent.
"""
from alembic import op
import sqlalchemy as sa

revision = "573da995cdbd"
down_revision = "6988ec068d41"  # PAD-672 S1 (chain settled by the coordinator 2026-10-22)
branch_labels = None
depends_on = None


def _has_table(name):
    return name in sa.inspect(op.get_bind()).get_table_names()


def upgrade():
    if _has_table("push_outbox"):
        return
    op.create_table(
        "push_outbox",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.Column("due_at", sa.DateTime(), nullable=False),
        sa.Column("channel", sa.String(16), nullable=False),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("payload", sa.JSON(), nullable=True),
        sa.Column("status", sa.String(16), nullable=False, server_default="pending"),
        sa.Column("attempts", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("claimed_by", sa.String(64), nullable=True),
        sa.Column("claimed_at", sa.DateTime(), nullable=True),
        sa.Column("last_error", sa.String(120), nullable=True),
        sa.Column("sent_at", sa.DateTime(), nullable=True),
    )
    op.create_index("ix_push_outbox_status_due_at", "push_outbox", ["status", "due_at"])


def downgrade():
    if _has_table("push_outbox"):
        op.drop_index("ix_push_outbox_status_due_at", table_name="push_outbox")
        op.drop_table("push_outbox")
