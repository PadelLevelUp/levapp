"""PAD-745: push_receipt, the Expo tickets whose receipts are read later (messaging.push-notifications
rule 10b).

Created only when absent (prod and staging drift: migrations must be idempotent). updated_at as every
new table (ledger rule). No data: rows appear with the first push sent after the deploy. The
downgrade drops it; the receipts not yet read are lost, nothing else.

Revision ID: 7a294b4a5a9c
Revises: 573da995cdbd (unconfirmed: re-chains on 459fc0208b0d when #817 lands)
Create Date: 2026-10-23 02:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

revision = "7a294b4a5a9c"
down_revision = "573da995cdbd"  # unconfirmed: re-chains on 459fc0208b0d when #817 lands (coordinator 2026-10-23)
branch_labels = None
depends_on = None


def _has_table(name):
    return name in sa.inspect(op.get_bind()).get_table_names()


def upgrade():
    if _has_table("push_receipt"):
        return
    op.create_table(
        "push_receipt",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.Column("ticket_id", sa.String(64), nullable=False),
        sa.Column("token", sa.String(255), nullable=False),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("outbox_id", sa.Integer(), nullable=True),
        sa.Column("sent_at", sa.DateTime(), nullable=False),
        sa.Column("status", sa.String(16), nullable=False, server_default="pending"),
        sa.Column("error_code", sa.String(64), nullable=True),
        sa.Column("checked_at", sa.DateTime(), nullable=True),
        sa.UniqueConstraint("ticket_id", name="uq_push_receipt_ticket_id"),
    )
    op.create_index("ix_push_receipt_status_sent_at", "push_receipt", ["status", "sent_at"])
    op.create_index("ix_push_receipt_sent_at", "push_receipt", ["sent_at"])


def downgrade():
    if _has_table("push_receipt"):
        op.drop_index("ix_push_receipt_sent_at", table_name="push_receipt")
        op.drop_index("ix_push_receipt_status_sent_at", table_name="push_receipt")
        op.drop_table("push_receipt")
