"""PAD-742 admin.finance: the migration creates the four finance tables, matching the models, and a
second run changes nothing. Scratch SQLite (pattern: test_pad531_migration)."""
import importlib.util
import pathlib

import sqlalchemy as sa
from alembic.migration import MigrationContext
from alembic.operations import Operations

VERSIONS = pathlib.Path(__file__).resolve().parents[2] / "migrations" / "versions"
TABLES = ("finance_costs", "finance_cost_revisions", "finance_import_runs", "finance_gcp_costs")


def _load():
    (path,) = VERSIONS.glob("*pad742_finance*.py")
    spec = importlib.util.spec_from_file_location("pad742_mig", path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    assert mod.revision == "459fc0208b0d" and mod.down_revision == "573da995cdbd"
    return mod


def _upgrade(conn, mod):
    with Operations.context(MigrationContext.configure(conn)):
        mod.upgrade()


def test_the_migration_creates_the_finance_tables_as_the_models_declare_them():
    from padel_app.sql_db import db
    import padel_app.models  # noqa: F401  (registers the tables)

    mod = _load()
    conn = sa.create_engine("sqlite://").connect()
    conn.exec_driver_sql("PRAGMA foreign_keys=ON")
    _upgrade(conn, mod)
    inspector = sa.inspect(conn)
    for table in TABLES:
        migrated = {c["name"] for c in inspector.get_columns(table)}
        declared = {c.name for c in db.metadata.tables[table].columns}
        assert migrated == declared, table
    # Idempotent: a second run creates nothing and fails on nothing.
    _upgrade(conn, mod)
    assert set(TABLES) <= set(sa.inspect(conn).get_table_names())


def test_the_downgrade_drops_them():
    mod = _load()
    conn = sa.create_engine("sqlite://").connect()
    _upgrade(conn, mod)
    with Operations.context(MigrationContext.configure(conn)):
        mod.downgrade()
    assert not set(TABLES) & set(sa.inspect(conn).get_table_names())
