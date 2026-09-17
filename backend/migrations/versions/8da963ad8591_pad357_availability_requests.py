"""PAD-357: coach working hours, people and a recurrence on class requests; PAD-358's note.

Four nullable columns, each guarded so a re-run is a no-op and a hand-applied
column is left alone:
- coaches.working_hours JSON — settings.coach-working-hours (NULL = not set,
  classes.availability falls back to the 08:00-22:00 window)
- class_requests.invitee_player_ids JSON — the people the requester brings
- class_requests.recurrence JSON — {weekdays, startDate, endDate} for a weekly request
- class_join_requests.note VARCHAR(500) — PAD-358's optional note (Session C
  declares the model column; this is the only migration for it, batch order C after B)

No data changes. Downgrade drops the four columns, each guarded.

Revision ID: 8da963ad8591
Revises: 9812c5f388fc
Create Date: 2026-09-17
"""
import logging

import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect as sa_inspect

revision = "8da963ad8591"
down_revision = "9812c5f388fc"
branch_labels = None
depends_on = None

log = logging.getLogger("alembic.runtime.migration")

COLUMNS = (
    ("coaches", "working_hours", lambda: sa.Column("working_hours", sa.JSON(), nullable=True)),
    ("class_requests", "invitee_player_ids", lambda: sa.Column("invitee_player_ids", sa.JSON(), nullable=True)),
    ("class_requests", "recurrence", lambda: sa.Column("recurrence", sa.JSON(), nullable=True)),
    ("class_join_requests", "note", lambda: sa.Column("note", sa.String(length=500), nullable=True)),
)


def _has_column(table, name):
    return any(c["name"] == name for c in sa_inspect(op.get_bind()).get_columns(table))


def upgrade():
    for table, name, make in COLUMNS:
        if _has_column(table, name):
            log.info("PAD-357: %s.%s already present — skipping", table, name)
            continue
        op.add_column(table, make())
        log.info("PAD-357: added %s.%s", table, name)


def downgrade():
    sqlite = op.get_bind().dialect.name == "sqlite"
    for table, name, _make in COLUMNS:
        if not _has_column(table, name):
            continue
        if sqlite:
            with op.batch_alter_table(table) as batch:
                batch.drop_column(name)
        else:
            op.drop_column(table, name)
        log.info("PAD-357 downgrade: dropped %s.%s", table, name)
