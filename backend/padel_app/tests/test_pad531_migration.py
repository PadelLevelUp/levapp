"""PAD-531 admin.foundation rule 6: the migration creates both tables and seeds the owners.

Scratch SQLite with a hand-made `users` table (pattern: test_pad259_migration) proves the seed
and idempotency on the fast backend; the Postgres walk below proves the real revision applies
from its parent with the ORM-visible result (R-030).
"""
import importlib.util
import os
import pathlib

import pytest
import sqlalchemy as sa
from alembic.migration import MigrationContext
from alembic.operations import Operations

VERSIONS = pathlib.Path(__file__).resolve().parents[2] / "migrations" / "versions"
MIGRATIONS_DIR = str(VERSIONS.parent)
PARENT = "0d2107f3fa7b"
REVISION = "e4381787870f"


def _load():
    (path,) = VERSIONS.glob("*pad531_admin_roles_and_audit_log*.py")
    spec = importlib.util.spec_from_file_location("pad531_mig", path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    assert mod.revision == REVISION and mod.down_revision == PARENT
    return mod


def _scratch():
    engine = sa.create_engine("sqlite://")
    conn = engine.connect()
    conn.exec_driver_sql(
        "CREATE TABLE users (id INTEGER PRIMARY KEY, name VARCHAR(120), username VARCHAR(80), "
        "email VARCHAR(120), is_superadmin BOOLEAN NOT NULL DEFAULT 0)"
    )
    conn.exec_driver_sql(
        "INSERT INTO users (id, name, username, email, is_superadmin) VALUES "
        "(1, 'Boss', 'boss', 'Boss@LevApp.app', 1), (2, 'Ana', 'ana', 'ana@example.com', 0), "
        "(3, 'Old', 'old', 'old@gmail.com', 1), (4, 'Dup', 'dup', 'BOSS@levapp.app', 1), (5, 'Noemail', 'ne', NULL, 1)"
    )
    return conn


def _owners(conn):
    rows = conn.exec_driver_sql(
        "SELECT email, role, user_id, granted_by_email, revoked_at FROM admin_roles ORDER BY email"
    ).fetchall()
    return [tuple(r) for r in rows]


def test_the_migration_seeds_the_existing_superadmin_as_owner_sqlite():
    mod = _load()
    conn = _scratch()
    with Operations.context(MigrationContext.configure(conn)):
        mod.upgrade()
    tables = set(sa.inspect(conn).get_table_names())
    assert {"admin_roles", "admin_audit_log"} <= tables
    cols = {c["name"] for c in sa.inspect(conn).get_columns("admin_audit_log")}
    assert {"created_at", "updated_at", "before", "after", "request_id", "outcome"} <= cols
    owners = _owners(conn)
    # Lower-cased, deduplicated, staff-domain only (hardening 2026-10-07: old@gmail.com is not seeded).
    assert [(e, r, g, rv) for e, r, _u, g, rv in owners] == [
        ("admin@levapp.app", "owner", None, None),
        ("boss@levapp.app", "owner", None, None),
    ]
    assert owners[1][2] in (1, 4)  # linked to a product account with that email
    assert owners[0][2] is None
    # is_superadmin is untouched.
    assert conn.exec_driver_sql("SELECT count(*) FROM users WHERE is_superadmin = 1").scalar() == 4
    # Idempotent: a second run inserts nothing and creates nothing.
    with Operations.context(MigrationContext.configure(conn)):
        mod.upgrade()
    assert _owners(conn) == owners
    with Operations.context(MigrationContext.configure(conn)):
        mod.downgrade()
    assert not ({"admin_roles", "admin_audit_log"} & set(sa.inspect(conn).get_table_names()))


@pytest.mark.skipif(
    os.getenv("LEVAPP_TEST_DB", "sqlite").strip().lower() != "postgres",
    reason="walks the real Alembic revision; Postgres backend only",
)
def test_the_migration_walks_on_postgres_and_seeds_the_owner(app):
    from flask_migrate import downgrade, upgrade
    from sqlalchemy import text

    from padel_app.sql_db import db
    from padel_app.tests.helpers import insert_user_on_an_old_schema

    def release():
        db.session.commit()
        db.session.remove()

    with app.app_context():
        try:
            release()
            downgrade(directory=MIGRATIONS_DIR, revision=PARENT)
            assert "admin_roles" not in sa.inspect(db.engine).get_table_names()
            boss = insert_user_on_an_old_schema("p531boss", "Boss")
            db.session.execute(text("UPDATE users SET email = 'Boss@LevApp.app', is_superadmin = true WHERE id = :i"), {"i": boss.id})
            insert_user_on_an_old_schema("p531other", "Other")
            release()
            upgrade(directory=MIGRATIONS_DIR, revision=REVISION)
            rows = db.session.execute(
                text("SELECT email, role, user_id, revoked_at FROM admin_roles ORDER BY email")
            ).fetchall()
            assert [tuple(r) for r in rows] == [
                ("admin@levapp.app", "owner", None, None),
                ("boss@levapp.app", "owner", boss.id, None),
            ]
            assert db.session.execute(text("SELECT is_superadmin FROM users WHERE id = :i"), {"i": boss.id}).scalar() is True
            release()
            # The ORM agrees with the migrated table (flask db check territory).
            from padel_app.models.admin_role import AdminRole

            assert AdminRole.query.filter_by(email="boss@levapp.app").one().role == "owner"
            release()
        finally:
            release()
            upgrade(directory=MIGRATIONS_DIR)
            db.session.execute(text("DELETE FROM admin_roles"))
            db.session.execute(text("DELETE FROM users WHERE username IN ('p531boss', 'p531other')"))
            release()
