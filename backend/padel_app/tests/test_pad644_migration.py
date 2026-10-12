"""PAD-644 migration 734b8e37b4e2: guardian_consents, digital_consent_ages and
users.guardian_consent_status are dropped, the downgrade recreates them, and both directions are
idempotent. Scratch SQLite, as test_pad645_migration does."""
import importlib.util
import pathlib

import sqlalchemy as sa
from alembic.migration import MigrationContext
from alembic.operations import Operations


def _load():
    versions = pathlib.Path(__file__).resolve().parents[2] / "migrations" / "versions"
    (path,) = versions.glob("734b8e37b4e2_*.py")
    spec = importlib.util.spec_from_file_location("pad644_mig", path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def _scratch():
    conn = sa.create_engine("sqlite://").connect()
    conn.exec_driver_sql(
        "CREATE TABLE users (id INTEGER PRIMARY KEY, username VARCHAR(80), birth_date DATE,"
        " country VARCHAR(2), guardian_consent_status VARCHAR(16))"
    )
    conn.exec_driver_sql("INSERT INTO users (username, country) VALUES ('ana', 'PT')")
    conn.exec_driver_sql("CREATE TABLE digital_consent_ages (country VARCHAR(2) PRIMARY KEY, age INTEGER NOT NULL)")
    conn.exec_driver_sql(
        "CREATE TABLE guardian_consents (id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL UNIQUE"
        " REFERENCES users (id) ON DELETE CASCADE, guardian_email VARCHAR(120) NOT NULL,"
        " consent_token_hash VARCHAR(64), revoke_token_hash VARCHAR(64), requested_at DATETIME NOT NULL)"
    )
    conn.exec_driver_sql("CREATE INDEX ix_guardian_consents_consent_token_hash ON guardian_consents (consent_token_hash)")
    conn.exec_driver_sql("CREATE INDEX ix_guardian_consents_revoke_token_hash ON guardian_consents (revoke_token_hash)")
    return conn


def _run(conn, fn):
    mod = _load()
    ctx = MigrationContext.configure(conn)
    with Operations.context(ctx):
        mod.op = Operations(ctx)
        getattr(mod, fn)()


def _tables(conn):
    return set(sa.inspect(conn).get_table_names())


def _user_columns(conn):
    return [c["name"] for c in sa.inspect(conn).get_columns("users")]


def test_upgrade_drops_both_tables_and_the_column_and_a_second_run_changes_nothing():
    conn = _scratch()
    _run(conn, "upgrade")
    _run(conn, "upgrade")
    assert _tables(conn) == {"users"}
    assert _user_columns(conn) == ["id", "username", "birth_date", "country"]
    assert conn.exec_driver_sql("SELECT username, country FROM users").all() == [("ana", "PT")]


def test_downgrade_recreates_them_as_they_were():
    conn = _scratch()
    _run(conn, "upgrade")
    _run(conn, "downgrade")
    _run(conn, "downgrade")
    insp = sa.inspect(conn)
    assert _tables(conn) == {"users", "guardian_consents", "digital_consent_ages"}
    assert "guardian_consent_status" in _user_columns(conn)
    assert dict(conn.exec_driver_sql("SELECT country, age FROM digital_consent_ages").all())["PT"] == 13
    assert conn.exec_driver_sql("SELECT count(*) FROM digital_consent_ages").scalar() == 10
    assert {i["name"] for i in insp.get_indexes("guardian_consents")} == {
        "ix_guardian_consents_consent_token_hash", "ix_guardian_consents_revoke_token_hash"}
    assert {tuple(u["column_names"]) for u in insp.get_unique_constraints("guardian_consents")} == {("user_id",)}
    (fk,) = insp.get_foreign_keys("guardian_consents")
    assert (fk["referred_table"], fk["constrained_columns"], fk["options"].get("ondelete")) == (
        "users", ["user_id"], "CASCADE")
