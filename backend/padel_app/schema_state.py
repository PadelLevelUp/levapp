"""Where the database's schema stands against this image's migrations (PAD-691, PAD-696).

Spec: ``delivery.zero-downtime-deploy`` rules 9-11. One reading, four answers:

* ``at_head`` — ``alembic_version`` holds exactly the image's head revision(s);
* ``behind`` — every revision in the table is known to the image, and they are not the heads;
* ``ahead`` — the table holds a revision this image does not know: a newer release migrated it
  (the old container during a rolling deploy's overlap, or a ``rollback_to``);
* ``empty`` — no ``alembic_version`` table, or no row in it.

Three callers: the migrate step (``padel_app.migrate``), the entrypoint's boot gate (this
module's CLI) and ``/api/app/healthz``. Nothing here builds the Flask app, so the CLI never
starts the scheduler and never opens an ORM session.

CLI::

    python -m padel_app.schema_state --require not_behind

exits 1 when the schema is behind or empty (rule 10), 0 otherwise; ``SCHEMA_GATE=off`` skips the
check. Connection errors are retried for ``SCHEMA_GATE_DB_WAIT`` seconds (default 30).
"""
import argparse
import os
import sys
import time
from pathlib import Path

from sqlalchemy import create_engine, inspect, text
from sqlalchemy.pool import NullPool

AT_HEAD = "at_head"
BEHIND = "behind"
AHEAD = "ahead"
EMPTY = "empty"

MIGRATIONS_DIR = Path(__file__).resolve().parents[1] / "migrations"

_script_cache = {}


def gate_enabled(environ=None):
    """The gate is on only where the image turns it on (``ENV SCHEMA_GATE=on``, rule 10)."""
    environ = os.environ if environ is None else environ
    return environ.get("SCHEMA_GATE", "").strip().lower() in ("on", "1", "true")


def image_revisions(migrations_dir=MIGRATIONS_DIR):
    """``(heads, known)`` for the migration scripts this image carries. Read once per process."""
    key = str(migrations_dir)
    if key not in _script_cache:
        from alembic.script import ScriptDirectory

        script = ScriptDirectory(str(migrations_dir))
        known = frozenset(rev.revision for rev in script.walk_revisions())
        _script_cache[key] = (frozenset(script.get_heads()), known)
    return _script_cache[key]


def classify(db_revisions, heads, known):
    db_revisions = frozenset(db_revisions)
    if not db_revisions:
        return EMPTY
    if db_revisions - known:
        return AHEAD
    if db_revisions == heads:
        return AT_HEAD
    return BEHIND


def read_db_revisions(connection):
    if not inspect(connection).has_table("alembic_version"):
        return frozenset()
    rows = connection.execute(text("SELECT version_num FROM alembic_version")).fetchall()
    return frozenset(row[0] for row in rows)


def schema_state(connection, migrations_dir=MIGRATIONS_DIR):
    """``(state, db_revisions, heads)`` for the database behind ``connection``."""
    heads, known = image_revisions(migrations_dir)
    db_revisions = read_db_revisions(connection)
    return classify(db_revisions, heads, known), db_revisions, heads


def describe(state, db_revisions, heads):
    """One line, no secrets: the state and both revision lists."""
    return "schema {}: database {} vs image heads {}".format(
        state.replace("_", " "),
        ",".join(sorted(db_revisions)) or "(none)",
        ",".join(sorted(heads)) or "(none)",
    )


def database_uri():
    """The URI the app itself would use, resolved without building the app (PAD-95 classes)."""
    from padel_app.config import get_config_class

    config_cls = get_config_class(os.getenv("FLASK_ENV", "development"))
    config_cls.refresh_database_settings()
    return config_cls.SQLALCHEMY_DATABASE_URI


def read_state_with_retry(engine, wait_seconds, poll_seconds=2, log=print):
    """Reads the state, retrying connection errors (Postgres may still be starting) up to ``wait_seconds``."""
    deadline = time.monotonic() + wait_seconds
    while True:
        try:
            with engine.connect() as connection:
                return schema_state(connection)
        except Exception as exc:  # a schema answer is final; only reaching the database is retried
            if time.monotonic() >= deadline:
                raise
            log(f"[schema-gate] database not reachable yet ({type(exc).__name__}); retrying")
            time.sleep(poll_seconds)


def main(argv=None, environ=None):
    environ = os.environ if environ is None else environ
    parser = argparse.ArgumentParser(prog="python -m padel_app.schema_state")
    parser.add_argument("--require", choices=["not_behind"], default=None)
    args = parser.parse_args(argv)

    if args.require and not gate_enabled(environ):
        print("[schema-gate] SCHEMA_GATE is off: not checking the schema")
        return 0

    engine = create_engine(database_uri(), poolclass=NullPool)
    try:
        wait = float(environ.get("SCHEMA_GATE_DB_WAIT", "30"))
        try:
            state, db_revisions, heads = read_state_with_retry(engine, wait)
        except Exception as exc:
            print(f"[schema-gate] database not reachable after {wait:.0f}s: {type(exc).__name__}")
            return 1
    finally:
        engine.dispose()

    line = describe(state, db_revisions, heads)
    if state in (BEHIND, EMPTY) and args.require:
        print(f"[schema-gate] refusing to start: {line}; run the migrate step (scripts/migrate.sh)")
        return 1
    if state == AHEAD:
        print(f"[schema-gate] WARNING {line} (a newer release migrated it; expand/contract keeps this safe)")
        return 0
    print(f"[schema-gate] {line}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
