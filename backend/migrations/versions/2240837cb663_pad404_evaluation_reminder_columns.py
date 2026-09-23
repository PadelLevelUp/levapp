"""PAD-404 — the evaluation reminder's two columns on notification_configs (slot 3).

evaluations.reminders rules 1-3, notifications.config rule 13: `evaluation_reminder_type`
('never' | 'monthly' | 'every_n_classes', server default 'never' so every existing coach
keeps today's behaviour — no marker until they choose) and `evaluation_reminder_value`
(N, NULL unless every_n_classes). They are NOT the class reminder's `reminder_type` /
`reminder_value`. Idempotent: each column is guarded; no backfill (the server default is
the backfill); downgrade drops what is present.

Revision ID: 2240837cb663
Revises: 6a6ac64d814b
Create Date: 2026-09-22
"""
import logging

import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect as sa_inspect

revision = "2240837cb663"
# Slot 3 of the evaluation chain: parented on slice 7's revision (6a6ac64d814b, PAD-402).
# Lands after PAD-402; until that merges, CI on this branch lacks the parent (expected red).
down_revision = "6a6ac64d814b"
branch_labels = None
depends_on = None

log = logging.getLogger("alembic.runtime.migration")

TABLE = "notification_configs"


def _insp():
    return sa_inspect(op.get_bind())


def _has_table(table):
    return _insp().has_table(table)


def _has_column(table, name):
    return _has_table(table) and any(c["name"] == name for c in _insp().get_columns(table))


COLUMNS = (
    ("evaluation_reminder_type",
     lambda: sa.Column("evaluation_reminder_type", sa.String(length=16), nullable=False, server_default="never")),
    ("evaluation_reminder_value",
     lambda: sa.Column("evaluation_reminder_value", sa.Integer(), nullable=True)),
)


def upgrade():
    if not _has_table(TABLE):
        log.info("PAD-404: %s does not exist — nothing to add", TABLE)
        return
    for name, make in COLUMNS:
        if _has_column(TABLE, name):
            log.info("PAD-404: %s.%s already present — skipping", TABLE, name)
            continue
        with op.batch_alter_table(TABLE) as batch:
            batch.add_column(make())
        log.info("PAD-404: added %s.%s", TABLE, name)


def downgrade():
    if not _has_table(TABLE):
        return
    for name, _make in reversed(COLUMNS):
        if not _has_column(TABLE, name):
            continue
        with op.batch_alter_table(TABLE) as batch:
            batch.drop_column(name)
        log.info("PAD-404: dropped %s.%s", TABLE, name)
