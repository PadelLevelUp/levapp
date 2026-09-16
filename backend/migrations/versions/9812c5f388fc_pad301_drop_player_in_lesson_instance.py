"""PAD-301 (PAD-259 phase 2): drop the shadow junction ``player_in_lesson_instance``.

Since PAD-259 (``fed5ed4916a8``) the ``Presence`` row IS the per-occurrence
enrolment (``classes.instance-enrollment`` rule 1) and every reader walks
``presences``; the junction was only still written as a shadow so the two could
be reconciled for one release. The gate for this migration was
``reconcile_enrolment()`` reporting no junction pair without a presence on a
production copy after PAD-259 shipped — 0 of 4,443 on the 2026-09-16 copy.

Upgrade, guarded and fail-closed:
1. If the table is already gone, nothing happens (re-runs are no-ops).
2. Every junction pair must have a presence. If any does not, the upgrade
   RAISES naming the first ten pairs — it never drops an enrolment the code
   might still be able to see only through the junction.
3. The table (with its unique constraint and index) is dropped.

Downgrade recreates the table with the shape the pre-drop code wrote — the
mixin ``created_at`` / ``updated_at`` (initial migration), NOT NULL keys
(PAD-273), the CASCADE foreign keys under the ``_fkey`` names production has,
the unique pair and PAD-263's index — and refills it with one row per presence,
so the shadow is faithful and writable again and ``flask db check`` is clean
against the pre-drop models; a second downgrade is a no-op (the index is
re-guarded on its own).

Revision ID: 9812c5f388fc
Revises: f50214af74f1
Create Date: 2026-09-16
"""
import logging

import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect as sa_inspect

revision = "9812c5f388fc"
down_revision = "f50214af74f1"
branch_labels = None
depends_on = None

log = logging.getLogger("alembic.runtime.migration")

TABLE = "player_in_lesson_instance"

ORPHANS_SQL = (
    "SELECT j.player_id, j.lesson_instance_id FROM player_in_lesson_instance j "
    "LEFT JOIN presences p ON p.player_id = j.player_id "
    "AND p.lesson_instance_id = j.lesson_instance_id "
    "WHERE p.id IS NULL ORDER BY j.lesson_instance_id, j.player_id"
)

REFILL_SQL = (
    "INSERT INTO player_in_lesson_instance (player_id, lesson_instance_id, created_at, updated_at) "
    "SELECT p.player_id, p.lesson_instance_id, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP FROM presences p "
    "LEFT JOIN player_in_lesson_instance j ON j.player_id = p.player_id "
    "AND j.lesson_instance_id = p.lesson_instance_id "
    "WHERE j.id IS NULL"
)


def _has_table(name):
    return name in sa_inspect(op.get_bind()).get_table_names()


def _refuse_on_orphans():
    """Fail closed: a junction pair with no presence is an enrolment only the
    junction knows about. Dropping it would lose a student's seat silently."""
    rows = op.get_bind().execute(sa.text(ORPHANS_SQL)).fetchall()
    if rows:
        shown = ", ".join(f"(player {p}, instance {i})" for p, i in rows[:10])
        raise RuntimeError(
            f"PAD-301: {len(rows)} player_in_lesson_instance row(s) have no presence "
            f"— refusing to drop the table. First: {shown}. Run reconcile_enrolment() "
            "on this database and enrol those pairs through enrol() first."
        )


def upgrade():
    if not _has_table(TABLE):
        log.info("PAD-301: %s already gone — nothing to do", TABLE)
        return
    _refuse_on_orphans()
    held = op.get_bind().execute(sa.text(f"SELECT count(*) FROM {TABLE}")).scalar()
    op.drop_table(TABLE)
    log.info("PAD-301: dropped %s (%s shadow rows, every one with a presence)", TABLE, held)


INDEX = "ix_player_in_lesson_instance_lesson_instance_id"


def _has_index(table, name):
    return any(ix["name"] == name for ix in sa_inspect(op.get_bind()).get_indexes(table))


def downgrade():
    if not _has_table(TABLE):
        op.create_table(
            TABLE,
            # model.Model's mixin columns (initial migration e5442f6c568d).
            sa.Column("created_at", sa.DateTime(), nullable=True),
            sa.Column("updated_at", sa.DateTime(), nullable=True),
            sa.Column("id", sa.Integer(), primary_key=True),
            # NOT NULL since PAD-273 (501dcb2c12f5).
            sa.Column("player_id", sa.Integer(), nullable=False),
            sa.Column("lesson_instance_id", sa.Integer(), nullable=False),
            # The names production and staging carry: Postgres's auto names from the
            # initial migration (PAD-274 renamed only non-CASCADE keys, a no-op here).
            sa.ForeignKeyConstraint(
                ["player_id"], ["players.id"], ondelete="CASCADE",
                name="player_in_lesson_instance_player_id_fkey",
            ),
            sa.ForeignKeyConstraint(
                ["lesson_instance_id"], ["lesson_instances.id"], ondelete="CASCADE",
                name="player_in_lesson_instance_lesson_instance_id_fkey",
            ),
            sa.UniqueConstraint("player_id", "lesson_instance_id", name="uq_player_lesson_instance"),
        )
    if not _has_index(TABLE, INDEX):
        op.create_index(INDEX, TABLE, ["lesson_instance_id"])  # PAD-263 (cf030b78b088)
    refilled = op.get_bind().execute(sa.text(REFILL_SQL)).rowcount
    log.info("PAD-301 downgrade: %s back, %s row(s) refilled from presences", TABLE, refilled)
