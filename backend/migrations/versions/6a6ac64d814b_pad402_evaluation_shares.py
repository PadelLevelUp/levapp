"""PAD-402: evaluation_shares — the one share a coach has sent a player for an
evaluation record.

Additive, every DDL guarded so a re-run is a no-op and a hand-applied object is
left alone (production schemas drift): a new table only, no column added to
anything that exists. `record_id` FK's a single `evaluation_records.id` and
carries a unique index (`uq_evaluation_shares_record_id`, created as a guarded
index rather than an inline column constraint so a re-run stays a no-op), so a
record can be shared at most once — a re-share overwrites the row through the
service, not through a second insert. `card` is the frozen snapshot the player
is served; `category_ids`/`evolution`/`include_note` are what produced it.
`shared_at` is the naive-UTC instant the service stamps.

No data migration, no backfill: the table starts empty.

Downgrade drops the index then the table, each guarded.

Revision ID: 6a6ac64d814b
Revises: 21c864b3dd59
Create Date: 2026-09-22
"""
import logging

import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect as sa_inspect

revision = "6a6ac64d814b"
down_revision = "21c864b3dd59"
branch_labels = None
depends_on = None

log = logging.getLogger("alembic.runtime.migration")

INDEX_NAME = "uq_evaluation_shares_record_id"


def _insp():
    return sa_inspect(op.get_bind())


def _has_table(table):
    return _insp().has_table(table)


def _has_index(table, name):
    return _has_table(table) and any(i["name"] == name for i in _insp().get_indexes(table))


# ── upgrade ──────────────────────────────────────────────────────────────────


def upgrade():
    if not _has_table("evaluation_shares"):
        op.create_table(
            "evaluation_shares",
            sa.Column("created_at", sa.DateTime(), nullable=True),
            sa.Column("updated_at", sa.DateTime(), nullable=True),
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("record_id", sa.Integer(), nullable=False),
            sa.Column("shared_at", sa.DateTime(), nullable=False),
            sa.Column("category_ids", sa.JSON(), nullable=False),
            sa.Column("evolution", sa.String(length=8), nullable=False),
            sa.Column("include_note", sa.Boolean(), nullable=False),
            sa.Column("card", sa.JSON(), nullable=False),
            sa.ForeignKeyConstraint(
                ["record_id"], ["evaluation_records.id"],
                name="evaluation_shares_record_id_fkey", ondelete="CASCADE",
            ),
            sa.PrimaryKeyConstraint("id"),
        )
        log.info("PAD-402: created evaluation_shares")
    else:
        log.info("PAD-402: evaluation_shares already present — skipping")

    if _has_index("evaluation_shares", INDEX_NAME):
        log.info("PAD-402: index %s already present — skipping", INDEX_NAME)
    else:
        op.create_index(INDEX_NAME, "evaluation_shares", ["record_id"], unique=True)
        log.info("PAD-402: created index %s", INDEX_NAME)


# ── downgrade ────────────────────────────────────────────────────────────────


def downgrade():
    if _has_index("evaluation_shares", INDEX_NAME):
        op.drop_index(INDEX_NAME, table_name="evaluation_shares")
        log.info("PAD-402 downgrade: dropped index %s", INDEX_NAME)

    if _has_table("evaluation_shares"):
        op.drop_table("evaluation_shares")
        log.info("PAD-402 downgrade: dropped evaluation_shares")
