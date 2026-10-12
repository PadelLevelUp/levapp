"""PAD-581: why an invitation was retired, when it was withdrawn for side balance

Revision ID: 99aab91913e8
Revises: 38891288dc5c
Create Date: 2026-10-10

Adds one nullable column to ``notification_events`` (notifications.invitations rule 2d):

- ``retired_reason`` (String(16)): ``'side_balanced'`` when the engine withdrew a live round-1
  invitation because its spot re-counted to the other side. The row is ``expired`` with ``answer``
  NULL and no ``withdrawn_by_coach_at``, like a retired one; this marker is the difference. It keeps
  the student out of round 1 of that class again and lets them join its waiting list while the
  class has places. NULL for every other row.

No backfill: nothing before this migration was withdrawn for balance. Idempotent: the column is
added only when absent.
"""
import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "99aab91913e8"
down_revision = "38891288dc5c"
branch_labels = None
depends_on = None

TABLE = "notification_events"
COLUMN = "retired_reason"


def _columns() -> set:
    inspector = sa.inspect(op.get_bind())
    return {col["name"] for col in inspector.get_columns(TABLE)}


def upgrade():
    if COLUMN not in _columns():
        op.add_column(TABLE, sa.Column(COLUMN, sa.String(16), nullable=True))


def downgrade():
    if COLUMN in _columns():
        with op.batch_alter_table(TABLE) as batch:
            batch.drop_column(COLUMN)
