"""PAD-553 (B-346): a class ending at midnight ends at 00:00 of the NEXT day

Revision ID: bee8d57daf79
Revises: f831df5ef8d7
Create Date: 2026-10-08

Classes and occurrences ending at midnight were stored with the end at 00:00 of their own date,
before their start. This moves those ends to the next day: only rows whose end is before their
start AND falls exactly at 00:00. Any other backwards end is a typed mistake (B-294), not a
midnight class, and is left alone.

Idempotent: a repaired row no longer matches. Count-agnostic: it touches whatever matches.

Downgrade is a no-op on purpose. After the upgrade a repaired row is indistinguishable from a
midnight class written correctly since PAD-553, so there is no way to tell which rows to move back,
and moving them back would only recreate the defect.
"""
from alembic import op

revision = "bee8d57daf79"
down_revision = "f831df5ef8d7"
branch_labels = None
depends_on = None


_REPAIR = """
UPDATE {table}
SET end_datetime = end_datetime + INTERVAL '1 day'
WHERE end_datetime < start_datetime
  AND CAST(end_datetime AS TIME) = TIME '00:00:00'
"""

_REPAIR_SQLITE = """
UPDATE {table}
SET end_datetime = datetime(end_datetime, '+1 day')
WHERE end_datetime < start_datetime
  AND time(end_datetime) = '00:00:00'
"""


def upgrade():
    sql = _REPAIR_SQLITE if op.get_bind().dialect.name == "sqlite" else _REPAIR
    for table in ("lessons", "lesson_instances"):
        op.execute(sql.format(table=table))


def downgrade():
    # Documented no-op: see the module docstring.
    pass
