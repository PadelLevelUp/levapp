"""PAD-771: notification_config_changes, the history of the configuration keys that decide who is
invited (notifications.config rule 16).

Created only when absent (prod and staging drift: migrations must be idempotent). updated_at as every
new table (ledger rule). No data: rows appear with the first save after the deploy; the history
before it is not recoverable. The downgrade drops it and the recorded history with it, nothing else.

Revision ID: c4e1a7d2f771
Revises: 7a294b4a5a9c
Create Date: 2026-10-28 18:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

revision = "c4e1a7d2f771"
down_revision = "7a294b4a5a9c"  # PAD-745 push_receipt (#818)
branch_labels = None
depends_on = None


def _has_table(name):
    return name in sa.inspect(op.get_bind()).get_table_names()


def upgrade():
    if _has_table("notification_config_changes"):
        return
    op.create_table(
        "notification_config_changes",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.Column(
            "coach_id", sa.Integer(),
            sa.ForeignKey("coaches.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("changed_at", sa.DateTime(), nullable=False),
        sa.Column("key", sa.String(32), nullable=False),
        sa.Column("before", sa.JSON(), nullable=True),
        sa.Column("after", sa.JSON(), nullable=True),
    )
    op.create_index(
        "ix_notification_config_changes_coach_id_changed_at",
        "notification_config_changes", ["coach_id", "changed_at"],
    )


def downgrade():
    if _has_table("notification_config_changes"):
        op.drop_index(
            "ix_notification_config_changes_coach_id_changed_at",
            table_name="notification_config_changes",
        )
        op.drop_table("notification_config_changes")
