"""PAD-645 migration d0d3b33b7fd3: backend_app is dropped, the downgrade recreates it, and both
directions are idempotent. Scratch SQLite, as test_pad547_migration does."""
import importlib.util
import pathlib

import sqlalchemy as sa
from alembic.migration import MigrationContext
from alembic.operations import Operations


def _load():
    versions = pathlib.Path(__file__).resolve().parents[2] / "migrations" / "versions"
    (path,) = versions.glob("d0d3b33b7fd3_*.py")
    spec = importlib.util.spec_from_file_location("pad645_mig", path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def _scratch():
    conn = sa.create_engine("sqlite://").connect()
    conn.exec_driver_sql("CREATE TABLE images (id INTEGER PRIMARY KEY)")
    conn.exec_driver_sql(
        "CREATE TABLE backend_app (created_at DATETIME, updated_at DATETIME, id INTEGER PRIMARY KEY,"
        " name VARCHAR(80) NOT NULL UNIQUE, app_model_name VARCHAR(80) NOT NULL UNIQUE, color VARCHAR(10),"
        " image_id INTEGER REFERENCES images (id) ON DELETE SET NULL)"
    )
    conn.exec_driver_sql("INSERT INTO backend_app (name, app_model_name) VALUES ('Aplicações', 'Backend_App')")
    return conn


def _run(conn, fn):
    mod = _load()
    ctx = MigrationContext.configure(conn)
    with Operations.context(ctx):
        mod.op = Operations(ctx)
        getattr(mod, fn)()


def _tables(conn):
    return set(sa.inspect(conn).get_table_names())


def test_upgrade_drops_backend_app_and_a_second_run_changes_nothing():
    conn = _scratch()
    _run(conn, "upgrade")
    _run(conn, "upgrade")
    assert _tables(conn) == {"images"}


def test_downgrade_recreates_backend_app_as_it_was():
    conn = _scratch()
    _run(conn, "upgrade")
    _run(conn, "downgrade")
    _run(conn, "downgrade")
    insp = sa.inspect(conn)
    assert "backend_app" in _tables(conn)
    assert [c["name"] for c in insp.get_columns("backend_app")] == [
        "created_at", "updated_at", "id", "name", "app_model_name", "color", "image_id"]
    assert {tuple(u["column_names"]) for u in insp.get_unique_constraints("backend_app")} == {
        ("name",), ("app_model_name",)}
    (fk,) = insp.get_foreign_keys("backend_app")
    assert (fk["referred_table"], fk["constrained_columns"], fk["options"].get("ondelete")) == (
        "images", ["image_id"], "SET NULL")
