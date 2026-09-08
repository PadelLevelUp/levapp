"""needs-you queue: "Later" on an empty-seats card

Adds `needs_you_snoozes`: one row per (coach, queue item) the coach has pushed
back with "Later". `item_id` is the queue item's own id (`lessoninstance-<pk>`
or `lesson-<pk>-<date>`), because the queue is keyed by occurrence rather than
by one table's primary key. Rows are ignored once `snoozed_until` has passed;
nothing sweeps them, they are tiny and self-expiring.

Guarded with `has_table` (prod-schema-drift rule): staging is a copy of prod
per deploy, so a table that already exists must not fail the upgrade.

Revision ID: c144c9f02098
Revises: a5b6c7d8e9f0
Create Date: 2026-09-07
"""
from alembic import op
import sqlalchemy as sa


revision = "c144c9f02098"
down_revision = "a5b6c7d8e9f0"
branch_labels = None
depends_on = None

_TABLE = "needs_you_snoozes"


def upgrade():
    bind = op.get_bind()
    if sa.inspect(bind).has_table(_TABLE):
        return
    op.create_table(
        _TABLE,
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "coach_id",
            sa.Integer(),
            sa.ForeignKey("coaches.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("item_id", sa.String(length=64), nullable=False),
        sa.Column("snoozed_until", sa.DateTime(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.UniqueConstraint("coach_id", "item_id", name="uq_needs_you_snooze_coach_item"),
    )
    op.create_index(
        "ix_needs_you_snoozes_coach_id", _TABLE, ["coach_id"], unique=False
    )


def downgrade():
    bind = op.get_bind()
    if not sa.inspect(bind).has_table(_TABLE):
        return
    op.drop_index("ix_needs_you_snoozes_coach_id", table_name=_TABLE)
    op.drop_table(_TABLE)
