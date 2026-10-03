"""PAD-513 migration (clubs.courts rule 9): `lesson_instances.court_id`, nullable, FK -> courts.id
ON DELETE SET NULL. Guarded both ways: upgrade adds the column and the FK only if absent (a
prod-shaped database may already carry the column), downgrade drops them only if present.

Postgres only, like test_pad431_migration.py: the sqlite backend builds its schema with
`create_all` and never walks a revision. Nothing is seeded through the ORM (B-283): the walk
reads the catalogue only. The session is released before every Alembic call, and the `finally`
returns the database to head.
"""
import os

import pytest
from sqlalchemy import text

from padel_app.sql_db import db

pytestmark = pytest.mark.skipif(
    os.getenv("LEVAPP_TEST_DB", "sqlite").strip().lower() != "postgres",
    reason="walks the real Alembic revision; Postgres backend only",
)

PARENT = "b3a1c474d07b"
MIGRATIONS_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "migrations")


def _release():
    db.session.commit()
    db.session.remove()


def _has_column():
    return db.session.execute(text(
        "SELECT 1 FROM information_schema.columns WHERE table_name = 'lesson_instances' AND column_name = 'court_id'"
    )).first() is not None


def _fk_on_delete():
    """confdeltype of the FK on lesson_instances.court_id ('n' = SET NULL), or None."""
    return db.session.execute(text(
        "SELECT c.confdeltype FROM pg_constraint c "
        "JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY(c.conkey) "
        "WHERE c.contype = 'f' AND c.conrelid = 'lesson_instances'::regclass AND a.attname = 'court_id'"
    )).scalar()


def _fk_count():
    return db.session.execute(text(
        "SELECT count(*) FROM pg_constraint c "
        "JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY(c.conkey) "
        "WHERE c.contype = 'f' AND c.conrelid = 'lesson_instances'::regclass AND a.attname = 'court_id'"
    )).scalar()


def test_the_occurrence_court_migration_walks_both_ways_and_is_idempotent(app):
    from flask_migrate import downgrade, upgrade

    with app.app_context():
        try:
            _release()
            downgrade(directory=MIGRATIONS_DIR, revision=PARENT)
            assert not _has_column() and _fk_on_delete() is None
            _release()

            upgrade(directory=MIGRATIONS_DIR)
            assert _has_column() and _fk_on_delete() == "n"
            _release()

            # A prod-shaped database that already carries the bare column: the upgrade adds only the FK.
            downgrade(directory=MIGRATIONS_DIR, revision=PARENT)
            db.session.execute(text("ALTER TABLE lesson_instances ADD COLUMN court_id INTEGER"))
            _release()
            upgrade(directory=MIGRATIONS_DIR)
            assert _has_column() and _fk_on_delete() == "n"
            _release()

            # A drifted database whose column already has a SET NULL key under the Postgres default
            # name: the upgrade adds no second key, and the downgrade removes it with the column.
            downgrade(directory=MIGRATIONS_DIR, revision=PARENT)
            db.session.execute(text(
                "ALTER TABLE lesson_instances ADD COLUMN court_id INTEGER "
                "CONSTRAINT lesson_instances_court_id_fkey REFERENCES courts(id) ON DELETE SET NULL"
            ))
            _release()
            upgrade(directory=MIGRATIONS_DIR)
            assert _fk_count() == 1 and _fk_on_delete() == "n"
            _release()

            # And the downgrade from a database that never got the column changes nothing.
            downgrade(directory=MIGRATIONS_DIR, revision=PARENT)
            assert not _has_column()
            _release()
        finally:
            db.session.rollback()
            db.session.remove()
            upgrade(directory=MIGRATIONS_DIR)
