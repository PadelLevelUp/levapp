"""PAD-275: series identity, per-instance capacity override (audit M7, M1b)

Revision ID: f50214af74f1
Revises: 7558c350c002
Create Date: 2026-09-11

Decided 2026-09-11 (coordinator, owner informed): classes.recurrence rules 6-7,
classes.edit rule 4, classes.coach-assignment rule 4 (no column: the coach
junction stays and the code reads a primary coach). Guarded so a re-run is a
no-op; staging is a prod copy per deploy (PAD-200).

1. `lessons.series_id` INTEGER NULL, FK lessons.id ON DELETE SET NULL, indexed.
   Backfill: `series_id = id` for every lesson still NULL. Historical forks are
   NOT reconnected (decision 2): each existing lesson is its own series.
2. `lessons.excluded_dates` JSON NULL: dates removed from the series one at a
   time (classes.recurrence rule 7). Left NULL; the code reads NULL as [].
3. `lesson_instances.max_players_override` INTEGER NULL (classes.edit rule 4):
   NULL inherits the lesson's capacity. Backfill from the copied column:
   NULL where lesson_instances.max_players equals the lesson's, else the
   copied value. The copied column stays as a shadow for one release.

Counts logged at INFO for the deploy watch: lessons_series_backfilled,
instances_capacity_inherited, instances_capacity_overridden. Never deletes.
Downgrade drops the three columns, the index and the foreign key; rows stay.
"""
import logging

import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect as sa_inspect

revision = "f50214af74f1"
down_revision = "7558c350c002"
branch_labels = None
depends_on = None

log = logging.getLogger("alembic.runtime.migration")

FK_NAME = "fk_lessons_series_id_lessons"
IX_NAME = "ix_lessons_series_id"

SERIES_BACKFILL = "UPDATE lessons SET series_id = id WHERE series_id IS NULL"
SERIES_MISSING = "SELECT count(*) FROM lessons WHERE series_id IS NULL"

#: Only rows still NULL are touched, so a second run changes nothing.
CAPACITY_INHERITED = """
UPDATE lesson_instances SET max_players_override = NULL
WHERE max_players_override IS NULL
"""
CAPACITY_OVERRIDDEN = """
UPDATE lesson_instances SET max_players_override = max_players
WHERE max_players_override IS NULL
  AND max_players IS NOT NULL
  AND max_players <> (SELECT l.max_players FROM lessons l WHERE l.id = lesson_instances.lesson_id)
"""
CAPACITY_COUNT_OVERRIDDEN = "SELECT count(*) FROM lesson_instances WHERE max_players_override IS NOT NULL"
CAPACITY_COUNT_INHERITED = "SELECT count(*) FROM lesson_instances WHERE max_players_override IS NULL"


def _inspector():
    return sa_inspect(op.get_bind())


def _column(table, name):
    for col in _inspector().get_columns(table):
        if col["name"] == name:
            return col
    return None


def _has_index(table, name):
    return any(ix["name"] == name for ix in _inspector().get_indexes(table))


def _has_fk(table, name):
    return any(fk.get("name") == name for fk in _inspector().get_foreign_keys(table))


def _scalar(sql):
    return op.get_bind().execute(sa.text(sql)).scalar()


def upgrade():
    bind = op.get_bind()
    sqlite = bind.dialect.name == "sqlite"

    # 1. series_id
    if _column("lessons", "series_id") is None:
        op.add_column("lessons", sa.Column("series_id", sa.Integer(), nullable=True))
    if not _has_index("lessons", IX_NAME):
        op.create_index(IX_NAME, "lessons", ["series_id"])
    if not sqlite and not _has_fk("lessons", FK_NAME):
        op.create_foreign_key(FK_NAME, "lessons", "lessons", ["series_id"], ["id"], ondelete="SET NULL")
    series_before = _scalar(SERIES_MISSING)
    bind.execute(sa.text(SERIES_BACKFILL))
    series_after = _scalar(SERIES_MISSING)

    # 2. excluded_dates
    if _column("lessons", "excluded_dates") is None:
        op.add_column("lessons", sa.Column("excluded_dates", sa.JSON(), nullable=True))

    # 3. max_players_override
    if _column("lesson_instances", "max_players_override") is None:
        op.add_column("lesson_instances", sa.Column("max_players_override", sa.Integer(), nullable=True))
    overridden_before = _scalar(CAPACITY_COUNT_OVERRIDDEN)
    bind.execute(sa.text(CAPACITY_OVERRIDDEN))
    overridden = _scalar(CAPACITY_COUNT_OVERRIDDEN)
    inherited = _scalar(CAPACITY_COUNT_INHERITED)

    log.info(
        "PAD-275 backfill: lessons_series_backfilled=%s lessons_series_missing_after=%s "
        "instances_capacity_overridden=%s (newly=%s) instances_capacity_inherited=%s",
        series_before, series_after, overridden, overridden - overridden_before, inherited,
    )
    if series_after != 0:
        raise RuntimeError(f"PAD-275 backfill incomplete: {series_after} lesson(s) without series_id")


def downgrade():
    sqlite = op.get_bind().dialect.name == "sqlite"
    if _column("lesson_instances", "max_players_override") is not None:
        if sqlite:
            with op.batch_alter_table("lesson_instances") as batch:
                batch.drop_column("max_players_override")
        else:
            op.drop_column("lesson_instances", "max_players_override")
    if _column("lessons", "excluded_dates") is not None:
        if sqlite:
            with op.batch_alter_table("lessons") as batch:
                batch.drop_column("excluded_dates")
        else:
            op.drop_column("lessons", "excluded_dates")
    if _column("lessons", "series_id") is not None:
        if sqlite:
            with op.batch_alter_table("lessons") as batch:
                if _has_index("lessons", IX_NAME):
                    batch.drop_index(IX_NAME)
                batch.drop_column("series_id")
        else:
            if _has_fk("lessons", FK_NAME):
                op.drop_constraint(FK_NAME, "lessons", type_="foreignkey")
            if _has_index("lessons", IX_NAME):
                op.drop_index(IX_NAME, table_name="lessons")
            op.drop_column("lessons", "series_id")
