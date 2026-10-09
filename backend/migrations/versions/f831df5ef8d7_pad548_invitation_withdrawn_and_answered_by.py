"""PAD-548: a coach's withdrawal of an invitation, and who gave its answer

Revision ID: f831df5ef8d7
Revises: bb9ed5a6b56f
Create Date: 2026-10-07

Adds two nullable columns to ``notification_events`` (notifications.invitations rules 9 and 19,
calendar.event-detail rule 16):

- ``withdrawn_by_coach_at`` (DateTime): set when the coach deletes a live invitation. The row is
  retired as a filled spot retires it (``status = 'expired'``, ``answer`` NULL), and this stamp is
  what tells a withdrawal from a spot that went to someone else — and what the engine reads as
  a "no" for that occurrence.
- ``answered_by`` (String(8)): 'student' | 'coach', who recorded ``answer``; NULL while unanswered
  and for rows answered before this migration.

No backfill: nothing before this migration was withdrawn, and who answered an older row is not
recoverable. Idempotent: each column is added only when absent.
"""
import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "f831df5ef8d7"
down_revision = "bb9ed5a6b56f"
branch_labels = None
depends_on = None

TABLE = "notification_events"
COLUMNS = (
    ("withdrawn_by_coach_at", sa.DateTime()),
    ("answered_by", sa.String(8)),
)


def _columns() -> set:
    inspector = sa.inspect(op.get_bind())
    return {col["name"] for col in inspector.get_columns(TABLE)}


def upgrade():
    present = _columns()
    for name, kind in COLUMNS:
        if name not in present:
            op.add_column(TABLE, sa.Column(name, kind, nullable=True))


def downgrade():
    present = _columns()
    with op.batch_alter_table(TABLE) as batch:
        for name, _ in COLUMNS:
            if name in present:
                batch.drop_column(name)
