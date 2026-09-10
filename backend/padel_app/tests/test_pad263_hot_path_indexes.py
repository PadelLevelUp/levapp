"""
PAD-263 (audit H11) — the hot foreign-key lookups had no index.

Only unique constraints and a handful of token indexes existed, so every
per-class, per-vacancy and per-user lookup the calendar, the attendance sheet
and the invitation engine make was a sequential scan. Where a composite unique
constraint exists (`uq_presence_player_lesson_instance`, `uq_player_lesson`…)
it leads with the player or coach, so it cannot serve a lookup by class.

The revision `cf030b78b088` adds sixteen plain indexes and the models declare
the same ones. Both halves are pinned here, because the pytest schema is built
with `create_all` from the models while real databases get the migration: when
the two disagree nothing fails until `flask db migrate` drafts a revision that
drops the difference (ledger B-032).

Specs: the Entities sections of classes.instances, classes.enrollment,
classes.create, classes.coach-assignment, attendance.presence, calendar.blocks,
players.level-history, notifications.invitations and notifications.waiting-list.

The lesson_instances occurrence index is deliberately NOT unique; B-046 holds
the plan for the constraint.
"""
import importlib.util
from pathlib import Path

import pytest
import sqlalchemy as sa
from alembic.migration import MigrationContext
from alembic.operations import Operations

from padel_app.sql_db import db


MIGRATION_FILE = (
    Path(__file__).resolve().parents[2]
    / "migrations"
    / "versions"
    / "cf030b78b088_pad263_hot_path_indexes.py"
)

EXPECTED = {
    "ix_lesson_instances_lesson_id_occurrence_date": (
        "lesson_instances",
        ["lesson_id", "original_lesson_occurence_date"],
    ),
    "ix_lesson_instances_start_datetime": ("lesson_instances", ["start_datetime"]),
    "ix_presences_lesson_instance_id": ("presences", ["lesson_instance_id"]),
    "ix_player_in_lesson_instance_lesson_instance_id": (
        "player_in_lesson_instance",
        ["lesson_instance_id"],
    ),
    "ix_coach_in_lesson_instance_lesson_instance_id": (
        "coach_in_lesson_instance",
        ["lesson_instance_id"],
    ),
    "ix_player_in_lesson_lesson_id": ("player_in_lesson", ["lesson_id"]),
    "ix_coach_in_lesson_lesson_id": ("coach_in_lesson", ["lesson_id"]),
    "ix_notification_events_vacancy_id_status": (
        "notification_events",
        ["vacancy_id", "status"],
    ),
    "ix_notification_events_lesson_instance_id_status": (
        "notification_events",
        ["lesson_instance_id", "status"],
    ),
    "ix_notification_events_coach_id_created_at": (
        "notification_events",
        ["coach_id", "created_at"],
    ),
    "ix_notification_events_player_id_coach_id": (
        "notification_events",
        ["player_id", "coach_id"],
    ),
    "ix_vacancies_lesson_instance_id_status": (
        "vacancies",
        ["lesson_instance_id", "status"],
    ),
    "ix_vacancies_open": ("vacancies", ["status"]),
    "ix_calendar_blocks_user_id": ("calendar_blocks", ["user_id"]),
    "ix_waiting_list_entries_standing_entry_id": (
        "waiting_list_entries",
        ["standing_entry_id"],
    ),
    "ix_player_level_history_player_id_assigned_at": (
        "player_level_history",
        ["player_id", "assigned_at"],
    ),
}

OPEN_VACANCY_WHERE = "status = 'open'"


def _load_migration():
    spec = importlib.util.spec_from_file_location("pad263_migration", MIGRATION_FILE)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _reflected(engine, table):
    return {i["name"]: i for i in sa.inspect(engine).get_indexes(table)}


def _model_index(name):
    table, _ = EXPECTED[name]
    return next(i for i in db.metadata.tables[table].indexes if i.name == name)


@pytest.mark.parametrize("name", sorted(EXPECTED))
def test_the_model_schema_carries_each_hot_path_index(app, name):
    table, columns = EXPECTED[name]
    with app.app_context():
        reflected = _reflected(db.engine, table)
    assert name in reflected, f"{table} has no {name}"
    assert reflected[name]["column_names"] == columns
    # Plain indexes only. A unique one on these tables can fail the upgrade on
    # data prod already holds (B-046), which is a data fix, not an index.
    assert not reflected[name]["unique"]


def test_the_open_vacancy_index_is_partial(app):
    with app.app_context():
        index = _model_index("ix_vacancies_open")
    for dialect in ("postgresql", "sqlite"):
        where = index.dialect_options[dialect]["where"]
        assert where is not None, f"no {dialect}_where"
        assert str(where) == OPEN_VACANCY_WHERE


def test_the_migration_creates_exactly_the_indexes_the_models_declare(app):
    migration = _load_migration()
    declared = {name: (table, list(cols)) for name, table, cols, _ in migration.INDEXES}
    assert declared == EXPECTED
    wheres = {name: where for name, _, _, where in migration.INDEXES if where}
    assert wheres == {"ix_vacancies_open": OPEN_VACANCY_WHERE}


def test_the_lesson_instance_lookup_uses_the_occurrence_index(app):
    # The query get_or_materialize_instance and calendar_helpers issue for one
    # occurrence: before this index it scanned every instance of every class.
    with app.app_context():
        plan = db.session.execute(
            sa.text(
                "EXPLAIN QUERY PLAN SELECT id FROM lesson_instances "
                "WHERE lesson_id = 1 AND original_lesson_occurence_date = '2026-09-10'"
            )
        ).all()
    assert any("ix_lesson_instances_lesson_id_occurrence_date" in row[-1] for row in plan), plan


@pytest.mark.parametrize(
    "sql, index",
    [
        ("SELECT id FROM presences WHERE lesson_instance_id = 1", "ix_presences_lesson_instance_id"),
        (
            "SELECT id FROM player_in_lesson_instance WHERE lesson_instance_id = 1",
            "ix_player_in_lesson_instance_lesson_instance_id",
        ),
        (
            "SELECT id FROM notification_events WHERE vacancy_id = 1 AND status = 'sent'",
            "ix_notification_events_vacancy_id_status",
        ),
        ("SELECT id FROM vacancies WHERE status = 'open'", "ix_vacancies_open"),
    ],
)
def test_the_hot_lookups_use_their_index(app, sql, index):
    with app.app_context():
        plan = db.session.execute(sa.text(f"EXPLAIN QUERY PLAN {sql}")).all()
    assert any(index in row[-1] for row in plan), plan


def _run(engine, step):
    with engine.begin() as connection:
        with Operations.context(MigrationContext.configure(connection)):
            step()


@pytest.mark.parametrize("already_there", [(), ("ix_messages_sender_id",), ("ix_presences_lesson_instance_id", "ix_vacancies_open")])
def test_upgrade_and_downgrade_are_idempotent(app, tmp_path, already_there):
    """Staging is a prod copy (PAD-200) and prod has carried indexes no revision
    created (PAD-204's crash-loop). Every create and drop is guarded, so the
    revision applies over a schema that already has part of it, and re-running
    either direction is a no-op."""
    migration = _load_migration()
    engine = sa.create_engine(f"sqlite:///{tmp_path / 'pad263.db'}")
    with app.app_context():
        db.metadata.create_all(engine)
    # The schema as it was before this revision, except whatever prod already has.
    with engine.begin() as connection:
        for name in EXPECTED:
            if name not in already_there:
                connection.execute(sa.text(f"DROP INDEX {name}"))
    untouched = {t: set(_reflected(engine, t)) - set(EXPECTED) for t, _ in EXPECTED.values()}

    _run(engine, migration.upgrade)
    _run(engine, migration.upgrade)
    for name, (table, columns) in EXPECTED.items():
        assert _reflected(engine, table)[name]["column_names"] == columns

    _run(engine, migration.downgrade)
    _run(engine, migration.downgrade)
    for table, others in untouched.items():
        assert set(_reflected(engine, table)) == others, table
