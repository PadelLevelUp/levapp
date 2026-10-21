"""The migrate step: bring the schema to this image's head, once, under a lock (PAD-691).

Spec: ``delivery.zero-downtime-deploy`` rule 9. ``scripts/migrate.sh`` is a thin wrapper over::

    python -m padel_app.migrate

Called by ``rollout.sh --migrate`` (a one-shot container of the new image, before the new API
starts), by ``sync-staging-db.sh`` after a restore, and later by the GKE migrate Job.

1. Take ``pg_advisory_lock(MIGRATE_LOCK_KEY)`` on a dedicated autocommit connection (no open
   transaction, so it never holds a table lock against the upgrade) and keep it until the end.
   A concurrent run waits, printing every 30 s, and gives up after ``MIGRATE_LOCK_TIMEOUT``
   seconds (default 1500, under the deploy's 30-min ssh step) with exit 3.
2. Ahead of the image (a ``rollback_to``) or already at head: nothing to do, exit 0.
3. Otherwise run the unchanged ``python -m flask --app app.py db upgrade`` in a subprocess, so
   ``is_migration_invocation`` keeps the scheduler off and the production guard on.
4. Re-read the schema: anything but at head is exit 1.

Not ``flask db check``: it stays the CI drift gate (rule 9).
"""
import os
import subprocess
import sys
import time
from pathlib import Path

from sqlalchemy import create_engine, text
from sqlalchemy.pool import NullPool

from padel_app import schema_state as ss

# "LVMG". The scheduler's leadership lock is 0x4C455641 ("LEVA"); they must never collide.
MIGRATE_LOCK_KEY = 0x4C564D47
LOCK_TIMEOUT_EXIT = 3
BACKEND_DIR = Path(__file__).resolve().parents[1]


def log(message):
    print(f"[migrate] {message}", flush=True)


def acquire_lock(connection, timeout, *, key=MIGRATE_LOCK_KEY, poll=1.0, report_every=30.0,
                 clock=time.monotonic, sleep=time.sleep):
    """True once the lock is held; False after ``timeout`` seconds of someone else holding it."""
    started = clock()
    last_report = started
    while True:
        if connection.execute(text("SELECT pg_try_advisory_lock(:k)"), {"k": key}).scalar():
            return True
        now = clock()
        if now - started >= timeout:
            return False
        if now - last_report >= report_every:
            log(f"waiting for migrate lock ({now - started:.0f}s; another migrate step holds it)")
            last_report = now
        sleep(poll)


def run_upgrade():
    return subprocess.run(
        [sys.executable, "-m", "flask", "--app", "app.py", "db", "upgrade"], cwd=BACKEND_DIR
    ).returncode


def migrate(engine, *, lock_timeout, upgrade=run_upgrade, acquire=acquire_lock):
    t0 = time.monotonic()
    is_pg = engine.dialect.name == "postgresql"  # SQLite (tests) has no advisory locks
    with engine.connect().execution_options(isolation_level="AUTOCOMMIT") as lock_conn:
        if is_pg:
            if not acquire(lock_conn, lock_timeout):
                log(f"gave up waiting for the migrate lock after {lock_timeout:.0f}s")
                return LOCK_TIMEOUT_EXIT
            log(f"lock held after {time.monotonic() - t0:.1f}s")
        try:
            state, db_revs, heads = ss.schema_state(lock_conn)
            log(ss.describe(state, db_revs, heads))
            if state == ss.AHEAD:
                log("the database is ahead of this image (a rollback?): nothing to migrate")
                return 0
            if state == ss.AT_HEAD:
                log("already at head: nothing to migrate")
                return 0

            t1 = time.monotonic()
            log("running flask db upgrade")
            code = upgrade()
            log(f"flask db upgrade exited {code} after {time.monotonic() - t1:.1f}s")
            if code != 0:
                return code

            state, db_revs, heads = ss.schema_state(lock_conn)
            if state != ss.AT_HEAD:
                log(f"after the upgrade: {ss.describe(state, db_revs, heads)}; expected at head")
                return 1
            log(f"done: {ss.describe(state, db_revs, heads)} ({time.monotonic() - t0:.1f}s in all)")
            return 0
        finally:
            if is_pg:
                try:
                    lock_conn.execute(text("SELECT pg_advisory_unlock(:k)"), {"k": MIGRATE_LOCK_KEY})
                except Exception as exc:  # never mask the real outcome; the lock dies with the session
                    log(f"could not release the migrate lock ({type(exc).__name__}); it goes with the connection")


def main(environ=None):
    environ = os.environ if environ is None else environ
    timeout = float(environ.get("MIGRATE_LOCK_TIMEOUT", "1500"))
    engine = create_engine(ss.database_uri(), poolclass=NullPool)
    try:
        return migrate(engine, lock_timeout=timeout)
    finally:
        engine.dispose()


if __name__ == "__main__":
    sys.exit(main())
