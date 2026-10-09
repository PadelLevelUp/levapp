"""PAD-560: waiting-list scopes — an entry with no credit limit, and the whole-series mark

Revision ID: 38891288dc5c
Revises: 7f839fc06b1b
Create Date: 2026-10-09

- ``standing_waiting_list_entries.credits_total`` becomes nullable: NULL is "no credit limit"
  (notifications.waiting-list rules 19 and 19a) — a yes spends nothing and never closes the entry.
- ``standing_waiting_list_entries.whole_series`` (Boolean, NOT NULL, default false): the entry
  covers the whole series (rule 19); false is a dated window (rule 19a), which every series-scoped
  entry from before this revision is.

Idempotent: each step checks what is there first.
"""
import sqlalchemy as sa
from alembic import op

revision = "38891288dc5c"
down_revision = "7f839fc06b1b"
branch_labels = None
depends_on = None

TABLE = "standing_waiting_list_entries"


def _columns(table):
    return {c["name"] for c in sa.inspect(op.get_bind()).get_columns(table)}


def _is_nullable(table, column):
    return next(c["nullable"] for c in sa.inspect(op.get_bind()).get_columns(table) if c["name"] == column)


def upgrade():
    if not _is_nullable(TABLE, "credits_total"):
        with op.batch_alter_table(TABLE) as batch:
            batch.alter_column("credits_total", existing_type=sa.Integer(), nullable=True)
    if "whole_series" not in _columns(TABLE):
        with op.batch_alter_table(TABLE) as batch:
            batch.add_column(
                sa.Column("whole_series", sa.Boolean(), nullable=False, server_default=sa.false())
            )


def downgrade():
    if "whole_series" in _columns(TABLE):
        # A whole-series entry cannot exist on the old schema; it becomes a window to its stored end.
        with op.batch_alter_table(TABLE) as batch:
            batch.drop_column("whole_series")
    if _is_nullable(TABLE, "credits_total"):
        # The old schema needs a number: an unlimited entry becomes a one-credit one (its rows
        # stay), the smallest value the old form accepted.
        op.execute(f"UPDATE {TABLE} SET credits_total = 1 WHERE credits_total IS NULL")
        with op.batch_alter_table(TABLE) as batch:
            batch.alter_column("credits_total", existing_type=sa.Integer(), nullable=False)
