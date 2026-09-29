"""PAD-451 — the coach's quiet-hours window on notification_configs.

notifications.config rule 6a: `quiet_hours_start` / `quiet_hours_end` ("HH:00" or "HH:30",
club-local), both nullable — NULL reads as the default 22:00 / 07:00, so every existing coach keeps
today's window with no backfill. Additive and idempotent: each column is guarded (prod schema can
drift, see the memory on idempotent migrations); downgrade drops what is present.

Revision ID: 4dbac8a33648
Revises: 2ad9b898d99b
Create Date: 2026-09-25
"""
import logging

import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect as sa_inspect

revision = "4dbac8a33648"
down_revision = "2ad9b898d99b"
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
    ("quiet_hours_start", lambda: sa.Column("quiet_hours_start", sa.String(length=5), nullable=True)),
    ("quiet_hours_end", lambda: sa.Column("quiet_hours_end", sa.String(length=5), nullable=True)),
)


def upgrade():
    if not _has_table(TABLE):
        log.info("PAD-451: %s does not exist — nothing to add", TABLE)
        return
    for name, make in COLUMNS:
        if _has_column(TABLE, name):
            log.info("PAD-451: %s.%s already present — skipping", TABLE, name)
            continue
        with op.batch_alter_table(TABLE) as batch:
            batch.add_column(make())
        log.info("PAD-451: added %s.%s", TABLE, name)


def downgrade():
    if not _has_table(TABLE):
        return
    for name, _make in reversed(COLUMNS):
        if not _has_column(TABLE, name):
            continue
        with op.batch_alter_table(TABLE) as batch:
            batch.drop_column(name)
        log.info("PAD-451: dropped %s.%s", TABLE, name)
