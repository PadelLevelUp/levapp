"""PAD-685 (notifications.config rule 6e): "do not invite a student who already has a class that day"
is ON by default, and migration PAD-685 switches every existing coach on once (idempotently)."""
import importlib.util
import pathlib

import sqlalchemy as sa
from alembic.migration import MigrationContext
from alembic.operations import Operations


def test_a_fresh_config_serializes_the_restriction_on(app):
    from padel_app.models.notification_config import DEFAULT_RESTRICTIONS, NotificationConfig

    assert DEFAULT_RESTRICTIONS["noSameDayClass"] == {"enabled": True}
    assert NotificationConfig().restrictions["noSameDayClass"] == {"enabled": True}


def test_a_save_without_the_key_keeps_a_stored_off(app):
    from padel_app.models.notification_config import NotificationConfig

    with app.app_context():
        cfg = NotificationConfig(no_same_day_class_enabled=False)
        cfg.restrictions = {"maxTotal": {"enabled": True, "value": 4}}
        assert cfg.no_same_day_class_enabled is False
        assert cfg.restrictions["noSameDayClass"] == {"enabled": False}


def _load():
    versions = pathlib.Path(__file__).resolve().parents[2] / "migrations" / "versions"
    (path,) = versions.glob("*pad685_no_same_day_class_on_by_default*.py")
    spec = importlib.util.spec_from_file_location("pad685_mig", path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def _scratch():
    conn = sa.create_engine("sqlite://").connect()
    conn.exec_driver_sql(
        "CREATE TABLE notification_configs (id INTEGER PRIMARY KEY, coach_id INTEGER, "
        "no_same_day_class_enabled BOOLEAN NOT NULL DEFAULT 0)")
    conn.exec_driver_sql("INSERT INTO notification_configs (id, coach_id) VALUES (1, 7), (2, 8)")
    return conn


def _run(conn, fn):
    mod = _load()
    ctx = MigrationContext.configure(conn)
    with Operations.context(ctx):
        mod.op = Operations(ctx)
        getattr(mod, fn)()


def _flags(conn):
    return [(i, bool(v)) for i, v in conn.exec_driver_sql(
        "SELECT id, no_same_day_class_enabled FROM notification_configs ORDER BY id").fetchall()]


def test_migration_switches_existing_rows_on_and_a_second_run_changes_nothing():
    conn = _scratch()
    assert _flags(conn) == [(1, False), (2, False)]
    _run(conn, "upgrade")
    assert _flags(conn) == [(1, True), (2, True)]
    default = next(c["default"] for c in sa.inspect(conn).get_columns("notification_configs")
                   if c["name"] == "no_same_day_class_enabled")
    assert str(default).lower() in ("true", "1")
    # Second run over the same data: nothing changes.
    before = _flags(conn)
    _run(conn, "upgrade")
    assert _flags(conn) == before


def test_downgrade_restores_only_the_old_server_default():
    conn = _scratch()
    _run(conn, "upgrade")
    _run(conn, "downgrade")
    assert _flags(conn) == [(1, True), (2, True)]
