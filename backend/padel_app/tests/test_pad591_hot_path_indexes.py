"""PAD-591 — four more hot-path indexes (the PAD-571 study): the messaging feed's
``message_type`` filter, the conversation list's ``last_message_at`` order, and the calendar's
``lessons.start_datetime`` bound and ``lessons.club_id`` lookups.

Same two halves as PAD-263: the pytest schema is built from the models, real databases get the
migration, so both are pinned and the revision must be idempotent over a schema that already has
part of it (staging is a prod copy, PAD-200).
"""
import importlib.util
from pathlib import Path

import pytest
import sqlalchemy as sa
from alembic import op
from alembic.migration import MigrationContext
from alembic.operations import Operations

from padel_app.sql_db import db

MIGRATION_DIR = Path(__file__).resolve().parents[2] / "migrations" / "versions"

EXPECTED = {
    "ix_messages_message_type": ("messages", ["message_type"]),
    "ix_conversations_last_message_at": ("conversations", ["last_message_at"]),
    "ix_lessons_start_datetime": ("lessons", ["start_datetime"]),
    "ix_lessons_club_id": ("lessons", ["club_id"]),
}


def _load_migration():
    (path,) = MIGRATION_DIR.glob("*_pad591_hot_path_indexes.py")
    spec = importlib.util.spec_from_file_location("pad591_migration", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


@pytest.mark.parametrize("name", sorted(EXPECTED))
def test_the_model_schema_carries_each_index(app, name):
    table, columns = EXPECTED[name]
    with app.app_context():
        reflected = {i["name"]: i for i in sa.inspect(db.engine).get_indexes(table)}
    assert name in reflected, f"{table} has no {name}"
    assert reflected[name]["column_names"] == columns
    assert not reflected[name]["unique"]


def test_the_migration_creates_exactly_the_indexes_the_models_declare():
    migration = _load_migration()
    assert {name: (table, list(cols)) for name, table, cols in migration.INDEXES} == EXPECTED


def _run(engine, step):
    with engine.begin() as connection:
        with Operations.context(MigrationContext.configure(connection)):
            step()


@pytest.mark.parametrize("already_there", [(), ("ix_lessons_club_id",)])
def test_upgrade_and_downgrade_are_idempotent(app, already_there):
    migration = _load_migration()
    with app.app_context():
        engine = db.engine
        names = lambda: {i["name"] for table in {t for t, _ in EXPECTED.values()} for i in sa.inspect(engine).get_indexes(table)}  # noqa: E731
        _run(engine, migration.downgrade)
        assert not names() & set(EXPECTED)
        for name in already_there:
            table, columns = EXPECTED[name]
            _run(engine, lambda t=table, c=columns, n=name: op.create_index(n, t, c))
        _run(engine, migration.upgrade)
        _run(engine, migration.upgrade)
        assert set(EXPECTED) <= names()
        _run(engine, migration.downgrade)
        _run(engine, migration.downgrade)
        assert not names() & set(EXPECTED)
