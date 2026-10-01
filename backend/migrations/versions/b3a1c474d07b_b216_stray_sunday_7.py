"""B-216 (PAD-464) data repair: a recurrence rule's `daysOfWeek` 7 becomes 0.

Before PAD-464, moving a recurring class onto a Sunday wrote the ISO weekday 7 into `daysOfWeek`;
the calendar's convention is 0 = Sunday … 6 = Saturday, and `WEEKDAY_MAP` drops 7. Only the bug
ever wrote 7, so 7 → 0 is unambiguous. The days are de-duplicated and sorted, so `[0, 6, 7]`
becomes `[0, 6]` (prod's lesson 57, read 2026-10-01 — the only row). Every other key of the rule
is kept.

Only JSON rules holding a 7 are written, so a second run is a no-op. Downgrade does nothing: the 7
was never a valid value to restore.

Revision ID: b3a1c474d07b
Revises: 8dd861b33786
"""
import json

import sqlalchemy as sa
from alembic import op

revision = "b3a1c474d07b"
down_revision = "8dd861b33786"  # PAD-431
branch_labels = None
depends_on = None


def _repaired(rule):
    """The rule with 7 turned into 0, or None when it needs no change."""
    try:
        data = json.loads(rule)
    except (TypeError, ValueError):
        return None
    days = data.get("daysOfWeek") if isinstance(data, dict) else None
    if not isinstance(days, list) or 7 not in days:
        return None
    data["daysOfWeek"] = sorted({0 if day == 7 else day for day in days})
    return json.dumps(data)


def upgrade():
    bind = op.get_bind()
    rows = bind.execute(sa.text(
        "SELECT id, recurrence_rule FROM lessons WHERE recurrence_rule LIKE '%daysOfWeek%'"
    )).all()
    for lesson_id, rule in rows:
        fixed = _repaired(rule)
        if fixed is not None:
            bind.execute(
                sa.text("UPDATE lessons SET recurrence_rule = :rule WHERE id = :id"),
                {"rule": fixed, "id": lesson_id},
            )


def downgrade():
    pass
