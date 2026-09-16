"""PAD-273: schema hygiene — NOT NULL with database defaults, association keys, missing uniques (audit M12, M14)

Revision ID: 501dcb2c12f5
Revises: 4ac05ae43639
Create Date: 2026-09-10

Three kinds of change. Every one is guarded, so the revision is idempotent.
That matters because staging is a copy of prod, which carries objects no
migration created (PAD-200/220).

1. Flag and order columns get NOT NULL and a database default. Existing NULLs
   are first backfilled with the value the Python default would have written,
   so behaviour does not change: nothing in the code treats NULL as meaningful
   there, and the level ladder already reads NULL and 0 as "unset".
2. Both keys of the nine association tables become NOT NULL.
3. Three unique indexes the domain implies. The fourth the audit named,
   notification_events (vacancy_id, player_id, round_number), is left out:
   the engine can re-invite a player whose earlier invite for the vacancy was
   declined or expired, so the index could fail a live batch. That question
   belongs to the notification engine's owner (coordinator, 2026-09-10).

It never deletes and never fails on data (coordinator decision, 2026-09-10).
A table with a NULL-key association row keeps nullable keys, and a unique whose
columns already hold duplicates is not created. Each is SKIPPED with a WARNING
and the count, for a human to clean up. The PR body lists every skippable step.

The pytest suite builds its schema from the models, which declare the same
constraints, so the two do not drift.
"""
import logging

import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect as sa_inspect

revision = "501dcb2c12f5"
down_revision = "4ac05ae43639"
branch_labels = None
depends_on = None

log = logging.getLogger("alembic.runtime.migration")

#: (table, column, database default, backfill for existing NULLs)
DEFAULTED = (
    ("presences", "invited", "false", "false"),
    ("presences", "confirmed", "false", "false"),
    ("presences", "validated", "false", "false"),
    ("lessons", "status", "'active'", "'active'"),
    ("coach_levels", "display_order", "0", "0"),
    ("evaluation_entries", "evaluated_at", "now()", "COALESCE(created_at, now())"),
)

#: table -> its two keys
ASSOCIATIONS = {
    "coach_exercise": ("coach_id", "exercise_id"),
    "coach_exercise_group": ("coach_id", "exercise_group_id"),
    "coach_in_club": ("coach_id", "club_id"),
    "coach_in_lesson": ("coach_id", "lesson_id"),
    "coach_in_lesson_instance": ("coach_id", "lesson_instance_id"),
    "coach_in_player": ("coach_id", "player_id"),
    "player_in_club": ("player_id", "club_id"),
    "player_in_lesson": ("player_id", "lesson_id"),
    "player_in_lesson_instance": ("player_id", "lesson_instance_id"),
}

#: (table, index name, columns, partial predicate or None)
UNIQUES = (
    ("coach_levels", "uq_coach_levels_coach_code", ("coach_id", "code"), None),
    ("evaluation_categories", "uq_evaluation_categories_coach_name", ("coach_id", "name"), None),
    ("standing_waiting_list_entries", "uq_standing_entries_active_coach_player", ("coach_id", "player_id"), "is_active"),
)


def _inspector():
    return sa_inspect(op.get_bind())


def _column(table, name):
    insp = _inspector()
    if not insp.has_table(table):
        return None
    return next((c for c in insp.get_columns(table) if c["name"] == name), None)


def _has_index(table, name):
    insp = _inspector()
    if not insp.has_table(table):
        return False
    names = {i["name"] for i in insp.get_indexes(table)}
    names |= {u["name"] for u in insp.get_unique_constraints(table)}
    return name in names


def _scalar(sql):
    return op.get_bind().execute(sa.text(sql)).scalar()


def _duplicates(table, columns, predicate):
    where = [f"{c} IS NOT NULL" for c in columns]  # NULLs never collide in a unique index
    if predicate:
        where.append(predicate)
    cols = ", ".join(columns)
    return _scalar(
        f"SELECT count(*) FROM (SELECT {cols} FROM {table} WHERE {' AND '.join(where)} "
        f"GROUP BY {cols} HAVING count(*) > 1) duplicates"
    )


def upgrade():
    # 1. NOT NULL with a database default, after backfilling NULLs.
    for table, column, default, backfill in DEFAULTED:
        info = _column(table, column)
        if info is None:
            continue
        op.execute(f"UPDATE {table} SET {column} = {backfill} WHERE {column} IS NULL")
        if info["nullable"] or info.get("default") is None:
            op.alter_column(table, column, nullable=False, server_default=sa.text(default))

    # 2. Association keys NOT NULL, unless a row already has a NULL key.
    for table, keys in ASSOCIATIONS.items():
        infos = [_column(table, key) for key in keys]
        if any(info is None for info in infos) or not any(info["nullable"] for info in infos):
            continue
        orphans = _scalar(f"SELECT count(*) FROM {table} WHERE {keys[0]} IS NULL OR {keys[1]} IS NULL")
        if orphans:
            log.warning(
                "PAD-273: SKIPPED NOT NULL on %s(%s): %s row(s) have a NULL key; clean them up, then re-run",
                table, ", ".join(keys), orphans,
            )
            continue
        for key, info in zip(keys, infos):
            if info["nullable"]:
                op.alter_column(table, key, nullable=False)

    # 3. Unique indexes, unless the data already holds duplicates.
    for table, name, columns, predicate in UNIQUES:
        if not _inspector().has_table(table) or _has_index(table, name):
            continue
        duplicates = _duplicates(table, columns, predicate)
        if duplicates:
            log.warning(
                "PAD-273: SKIPPED unique %s on %s(%s): %s duplicate group(s); dedupe them, then re-run",
                name, table, ", ".join(columns), duplicates,
            )
            continue
        op.create_index(
            name, table, list(columns), unique=True,
            postgresql_where=sa.text(predicate) if predicate else None,
        )


def downgrade():
    for table, name, _columns, _predicate in UNIQUES:
        if _has_index(table, name):
            op.drop_index(name, table_name=table)
    for table, keys in ASSOCIATIONS.items():
        for key in keys:
            info = _column(table, key)
            if info is not None and not info["nullable"]:
                op.alter_column(table, key, nullable=True)
    for table, column, _default, _backfill in DEFAULTED:
        if _column(table, column) is not None:
            op.alter_column(table, column, nullable=True, server_default=None)
