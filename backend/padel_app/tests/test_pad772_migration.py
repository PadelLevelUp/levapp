"""PAD-772 migration d772a1b2c3d4: `presences.decline_source` (attendance.confirm rule 30,
calendar.student-blockers rule 23) with its CHECK, each added only when absent, dropped on downgrade.
Scratch SQLite, the way test_pad840_migration proves its migration; on Postgres the real revision is
walked down and up as well (test_pad402_migration_walk's pattern)."""
import importlib.util
import os
import pathlib

import pytest
import sqlalchemy as sa
from alembic.migration import MigrationContext
from alembic.operations import Operations

from padel_app.sql_db import db

MIGRATIONS_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "migrations")
PARENT = "c840d1e2f3a4"


def _load():
    versions = pathlib.Path(__file__).resolve().parents[2] / "migrations" / "versions"
    (path,) = versions.glob("d772a1b2c3d4_*.py")
    spec = importlib.util.spec_from_file_location("pad772_mig", path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def _run(conn, fn):
    mod = _load()
    ctx = MigrationContext.configure(conn)
    with Operations.context(ctx):
        mod.op = Operations(ctx)
        getattr(mod, fn)()


def _columns(conn):
    return {c["name"]: c["nullable"] for c in sa.inspect(conn).get_columns("presences")}


def test_it_adds_a_nullable_column_and_its_check_once_and_drops_them():
    with sa.create_engine("sqlite://").connect() as conn:
        conn.exec_driver_sql("CREATE TABLE presences (id INTEGER PRIMARY KEY, status VARCHAR(10))")
        conn.exec_driver_sql("INSERT INTO presences (id, status) VALUES (1, 'absent')")
        _run(conn, "upgrade")
        _run(conn, "upgrade")  # idempotent
        assert _columns(conn)["decline_source"] is True
        assert conn.exec_driver_sql("SELECT decline_source FROM presences WHERE id = 1").scalar() is None
        conn.exec_driver_sql("UPDATE presences SET decline_source = 'availability_block' WHERE id = 1")
        with pytest.raises(Exception, match="ck_presences_decline_source|CHECK"):
            conn.exec_driver_sql("UPDATE presences SET decline_source = 'anything' WHERE id = 1")
        _run(conn, "downgrade")
        _run(conn, "downgrade")
        assert "decline_source" not in _columns(conn)
        assert conn.exec_driver_sql("SELECT status FROM presences").scalar() == "absent"


def test_it_follows_pad_840s():
    mod = _load()
    assert (mod.revision, mod.down_revision) == ("d772a1b2c3d4", PARENT)


@pytest.mark.skipif(
    os.getenv("LEVAPP_TEST_DB", "sqlite").strip().lower() != "postgres",
    reason="walks the real Alembic revision; Postgres backend only",
)
def test_the_revision_walks_down_and_up_on_postgres(app):
    from flask_migrate import downgrade, upgrade
    from sqlalchemy import text

    def release():
        db.session.commit()
        db.session.remove()

    def has_column():
        return db.session.execute(text(
            "SELECT count(*) FROM information_schema.columns WHERE table_name='presences' AND column_name='decline_source'"
        )).scalar() == 1

    def has_check():
        return db.session.execute(text(
            "SELECT count(*) FROM pg_constraint WHERE conname='ck_presences_decline_source'"
        )).scalar() == 1

    with app.app_context():
        try:
            release()
            downgrade(directory=MIGRATIONS_DIR, revision=PARENT)
            assert not has_column() and not has_check()
            release()
            upgrade(directory=MIGRATIONS_DIR)
            assert has_column() and has_check()
            release()
            upgrade(directory=MIGRATIONS_DIR)  # a second run is a no-op
            assert has_column() and has_check()
            release()
        finally:
            db.session.rollback()
            release()
            upgrade(directory=MIGRATIONS_DIR)
            release()
