"""PAD-840 migration c840d1e2f3a4: `lessons.cancellation_reasons` (classes.delete rule 11), added only when
absent, dropped on downgrade. Scratch SQLite, the way test_pad745_migration proves its migration."""
import importlib.util
import pathlib

import sqlalchemy as sa
from alembic.migration import MigrationContext
from alembic.operations import Operations


def _load():
    versions = pathlib.Path(__file__).resolve().parents[2] / "migrations" / "versions"
    (path,) = versions.glob("c840d1e2f3a4_*.py")
    spec = importlib.util.spec_from_file_location("pad840_mig", path)
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
    return {c["name"]: c["nullable"] for c in sa.inspect(conn).get_columns("lessons")}


def test_it_adds_a_nullable_column_once_and_drops_it():
    with sa.create_engine("sqlite://").connect() as conn:
        conn.exec_driver_sql("CREATE TABLE lessons (id INTEGER PRIMARY KEY, title VARCHAR(255))")
        conn.exec_driver_sql("INSERT INTO lessons (id, title) VALUES (1, 'Terça')")
        _run(conn, "upgrade")
        _run(conn, "upgrade")
        assert _columns(conn)["cancellation_reasons"] is True
        _run(conn, "downgrade")
        _run(conn, "downgrade")
        assert "cancellation_reasons" not in _columns(conn)
        assert conn.exec_driver_sql("SELECT title FROM lessons").scalar() == "Terça"


def test_it_follows_pad_753s():
    mod = _load()
    assert (mod.revision, mod.down_revision) == ("c840d1e2f3a4", "b753c2d3e4f5")
