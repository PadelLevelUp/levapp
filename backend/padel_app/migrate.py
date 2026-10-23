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
   PAD-718 (rule 12): the previous release serves while this runs, so the subprocess gets
   ``LEVAPP_MIGRATE_STEP=1`` and ``migrations/env.py`` sets ``lock_timeout`` (``MIGRATE_DDL_LOCK_TIMEOUT``,
   3 s) and ``statement_timeout`` (``MIGRATE_STATEMENT_TIMEOUT``, 300 s) on its session: an ALTER
   waiting behind a long query stalls the API's queries on that table for at most the lock
   timeout. A lock timeout (SQLSTATE 55P03) rolls the one upgrade transaction back and exits
   ``LOCK_BUSY_EXIT``; only that code is retried, ``MIGRATE_ATTEMPTS`` (4) times in all, with
   ``RETRY_BACKOFF`` between attempts. A plain ``flask db upgrade`` (CI, tests, a laptop) sets nothing.
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
#: migrations/env.py exits with this when the upgrade hit its lock_timeout (PAD-718); EX_TEMPFAIL.
LOCK_BUSY_EXIT = 75
#: Seconds between attempts after a lock timeout: the API's queries flow in the gaps.
RETRY_BACKOFF = (5, 10, 20)
BACKEND_DIR = Path(__file__).resolve().parents[1]


def log(message):
    print(f"[migrate] {message}", flush=True)


def session_timeouts(environ):
    """(ddl lock timeout s, statement timeout s, attempts) for the upgrade's session (PAD-718)."""
    return (float(environ.get("MIGRATE_DDL_LOCK_TIMEOUT", "3")),
            float(environ.get("MIGRATE_STATEMENT_TIMEOUT", "300")),
            int(environ.get("MIGRATE_ATTEMPTS", "4")))


def upgrade_with_retries(upgrade, *, attempts, backoff=RETRY_BACKOFF, sleep=time.sleep):
    """Runs ``upgrade`` again after a lock timeout, up to ``attempts`` runs; any other code is final.
    Each failed attempt rolled its whole transaction back, so a retry is a clean re-run."""
    for attempt in range(1, attempts + 1):
        code = upgrade()
        if code != LOCK_BUSY_EXIT:
            return code
        if attempt == attempts:
            log(f"lock_timeout on attempt {attempt}/{attempts}: giving up; the schema is where it was")
            return code
        wait = backoff[min(attempt - 1, len(backoff) - 1)]
        log(f"lock_timeout on attempt {attempt}/{attempts}: a query holds a lock the migration needs; "
            f"rolled back, retrying in {wait}s")
        sleep(wait)
    return LOCK_BUSY_EXIT


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


def run_upgrade(environ=None):
    """One ``flask db upgrade`` with the migrate step's session timeouts (env.py reads them only
    under LEVAPP_MIGRATE_STEP). MIGRATE_DIRECTORY points it at another migrations directory (tests)."""
    environ = dict(os.environ if environ is None else environ)
    lock_s, statement_s, _ = session_timeouts(environ)
    environ.update({"LEVAPP_MIGRATE_STEP": "1",
                    "MIGRATE_DDL_LOCK_TIMEOUT": f"{lock_s:g}", "MIGRATE_STATEMENT_TIMEOUT": f"{statement_s:g}"})
    cmd = [sys.executable, "-m", "flask", "--app", "app.py", "db", "upgrade"]
    if environ.get("MIGRATE_DIRECTORY"):
        cmd += ["-d", environ["MIGRATE_DIRECTORY"]]
    return subprocess.run(cmd, cwd=BACKEND_DIR, env=environ).returncode


def migrate(engine, *, lock_timeout, upgrade=run_upgrade, acquire=acquire_lock, attempts=1,
            backoff=RETRY_BACKOFF, sleep=time.sleep):
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
            code = upgrade_with_retries(upgrade, attempts=attempts, backoff=backoff, sleep=sleep)
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
    lock_s, statement_s, attempts = session_timeouts(environ)
    log(f"session timeouts: lock_timeout {lock_s:g}s, statement_timeout {statement_s:g}s, "
        f"{attempts} attempt(s), backoff {'/'.join(map(str, RETRY_BACKOFF))}s (PAD-718)")
    engine = create_engine(ss.database_uri(), poolclass=NullPool)
    try:
        return migrate(engine, lock_timeout=timeout, upgrade=lambda: run_upgrade(environ),
                       attempts=attempts, backoff=RETRY_BACKOFF)
    finally:
        engine.dispose()


if __name__ == "__main__":
    sys.exit(main())
