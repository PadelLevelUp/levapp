"""Merge the eight heads of the 2026-09-10 staging batch

Revision ID: 93731ca0bea7
Revises: 0efff0790eb0, 358e03e9a3a9, a7c31e9f04d2, 874c1724e2cf, 78878e1670aa, f24a01a6e108, e4b8c2d17a35, 7267e255bff2
Create Date: 2026-09-10

No-op. The batch landed eight migrations that each branched from the
PAD-246 head `ad97ec649746` (PAD-129 → PAD-130 → PAD-131 as one chain), so
Alembic saw eight heads and `flask db upgrade` in the deploy entrypoint would
refuse to run. This revision only joins them; every parent keeps its own
guarded, idempotent upgrade and downgrade.

Parents:
  0efff0790eb0  PAD-255  level delete SET NULL
  358e03e9a3a9  PAD-207  reminder_attempts
  a7c31e9f04d2  PAD-131  class_join_requests (after PAD-129, PAD-130)
  874c1724e2cf  PAD-232  request alerts
  78878e1670aa  PAD-194  courts
  f24a01a6e108  PAD-139  password recovery
  e4b8c2d17a35  PAD-104  class_requests
  7267e255bff2  PAD-82   single recurring season
"""

# revision identifiers, used by Alembic.
revision = "93731ca0bea7"
down_revision = (
    "0efff0790eb0",
    "358e03e9a3a9",
    "a7c31e9f04d2",
    "874c1724e2cf",
    "78878e1670aa",
    "f24a01a6e108",
    "e4b8c2d17a35",
    "7267e255bff2",
)
branch_labels = None
depends_on = None


def upgrade():
    pass


def downgrade():
    pass
