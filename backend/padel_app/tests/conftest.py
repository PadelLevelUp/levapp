"""Backend test fixtures (PAD-278, audit M20).

Two database backends, chosen by ``LEVAPP_TEST_DB``:

* ``sqlite`` (default) — the fast path: a throwaway file per test built with
  ``create_all``, **with foreign keys enforced** (``PRAGMA foreign_keys=ON``),
  so every ``ondelete`` in the models is exercised rather than silently
  ignored.
* ``postgres`` — what production runs: one scratch database per session
  (``levelup_pytest_<pid>`` on ``POSTGRES_HOST``/``POSTGRES_PORT`` as
  ``POSTGRES_USER``/``POSTGRES_PW``), built by running the **real Alembic
  migrations** (``flask db upgrade``), so a model column with no migration, a
  second head, or a migration that does not apply cleanly fails the suite.
  Each test starts from empty tables (``TRUNCATE … RESTART IDENTITY CASCADE``).

CI runs both (`.github/workflows/backend-tests.yaml`). Locally::

    python -m pytest padel_app/tests                     # sqlite
    LEVAPP_TEST_DB=postgres POSTGRES_PW=… python -m pytest padel_app/tests

Test code is backend-agnostic: it only ever sees the ``app`` fixture.
"""
import contextlib
import gc
import os
import pathlib
import tempfile

import pytest
from sqlalchemy import event, text

from padel_app import create_app
from padel_app.models import User
from padel_app.sql_db import db, init_db

TEST_DB_BACKEND = os.getenv("LEVAPP_TEST_DB", "sqlite").strip().lower()
MIGRATIONS_DIR = pathlib.Path(__file__).resolve().parents[2] / "migrations"

BASE_TEST_CONFIG = {
    "TESTING": True,
    "SQLALCHEMY_TRACK_MODIFICATIONS": False,
}


def _sqlite_fk_on(dbapi_connection, _record):
    dbapi_connection.execute("PRAGMA foreign_keys=ON")


# ---------------------------------------------------------------------------
# postgres backend
# ---------------------------------------------------------------------------

def _postgres_settings():
    return {
        "host": os.getenv("POSTGRES_HOST", "localhost"),
        "port": os.getenv("POSTGRES_PORT", "5432"),
        "user": os.getenv("POSTGRES_USER", "padel_app_user"),
        "password": os.getenv("POSTGRES_PW", ""),
    }


def _admin_connection(settings):
    import psycopg2

    conn = psycopg2.connect(dbname="postgres", **settings)
    conn.autocommit = True
    return conn


def _run_admin(settings, statements):
    # No `with conn:` here — psycopg2's context manager opens a transaction
    # block, and CREATE/DROP DATABASE refuse to run inside one.
    conn = _admin_connection(settings)
    try:
        cur = conn.cursor()
        for statement, params in statements:
            cur.execute(statement, params)
    finally:
        conn.close()


def _drop_database(settings, name):
    _run_admin(
        settings,
        [
            (
                # Only our own client backends: a non-superuser cannot end an
                # autovacuum worker (it raised InsufficientPrivilege twice on
                # 2026-09-11), and DROP DATABASE signals those itself.
                "SELECT pg_terminate_backend(pid) FROM pg_stat_activity "
                "WHERE datname = %s AND pid <> pg_backend_pid() "
                "AND usename = current_user AND backend_type = 'client backend'",
                (name,),
            ),
            (f'DROP DATABASE IF EXISTS "{name}"', None),
        ],
    )


@pytest.fixture(scope="session")
def postgres_test_database_uri():
    """URI of a scratch Postgres database built by the real migrations, or
    ``None`` on the sqlite backend."""
    if TEST_DB_BACKEND != "postgres":
        yield None
        return

    settings = _postgres_settings()
    name = f"levelup_pytest_{os.getpid()}"
    _drop_database(settings, name)
    _run_admin(settings, [(f'CREATE DATABASE "{name}"', None)])

    uri = (
        f"postgresql://{settings['user']}:{settings['password']}"
        f"@{settings['host']}:{settings['port']}/{name}"
    )
    app = create_app({**BASE_TEST_CONFIG, "SQLALCHEMY_DATABASE_URI": uri})
    with app.app_context():
        init_db(app)
        from flask_migrate import upgrade

        upgrade(directory=str(MIGRATIONS_DIR))
        db.get_engine(app).dispose()

    yield uri

    _drop_database(settings, name)




#: Sessions still idle in a transaction after a test released its app (Postgres
#: only), attributed to the test. Fixture output is captured, so they are listed
#: in the terminal summary — and a non-empty list fails the run (B-068, R-007):
#: this is the alarm, not the fix.
_LEAKED_SESSIONS = []
_LEAKED_PIDS = set()

#: Backends of OUR role that are idle inside a transaction on this throwaway
#: database. `usename = current_user` because a non-superuser may only end its
#: own backends — pg_terminate_backend on anyone else's raises.
_IDLE_IN_TX = (
    "FROM pg_stat_activity WHERE datname = current_database() "
    "AND pid <> pg_backend_pid() AND usename = current_user "
    "AND state LIKE 'idle in transaction%%'"
)


def _record_leaked_sessions(label):
    """Append every idle-in-transaction backend not yet recorded, tagged ``label``."""
    rows = db.session.execute(text(
        f"SELECT pid, left(regexp_replace(query, '\\s+', ' ', 'g'), 200) {_IDLE_IN_TX}"
    )).all()
    for pid, query in rows:
        if pid not in _LEAKED_PIDS:
            _LEAKED_PIDS.add(pid)
            _LEAKED_SESSIONS.append(f"{label}: session {pid}: {query}")
    return len(rows)


def pytest_terminal_summary(terminalreporter):
    if _LEAKED_SESSIONS:
        terminalreporter.section(
            "leaked database sessions (idle in transaction after the test — run FAILED)"
        )
        for line in _LEAKED_SESSIONS:
            terminalreporter.write_line(line)
        terminalreporter.write_line(
            "A session outlived its app context (compass R-007, B-068). Seed helpers that "
            "push their own context go BEFORE the outer block touches db.session/Model.query."
        )


def pytest_sessionfinish(session, exitstatus):
    if _LEAKED_SESSIONS and session.exitstatus == 0:
        session.exitstatus = 1


def _truncate_all(app):
    tables = ", ".join(f'"{t.name}"' for t in reversed(db.metadata.sorted_tables))
    with app.app_context():
        # A connection an earlier test left checked out inside a transaction
        # holds locks that make this TRUNCATE wait forever: backend-tests'
        # Postgres job hung here in CI (run 34519232824, in the setup of the
        # second TestDeleteCancelsJobs test in test_scheduler_job_lifecycle).
        # Safety net, kept after B-068 fixed the leak itself: record anything
        # the per-test check missed, collect cycles to release it, end whatever
        # is still idle in a transaction, and fail fast rather than hang.
        _record_leaked_sessions("before TRUNCATE (unattributed)")
        gc.collect()
        db.session.execute(text(f"SELECT pg_terminate_backend(pid) {_IDLE_IN_TX}")).all()
        db.session.execute(text("SET LOCAL lock_timeout = '15s'"))
        db.session.execute(text(f"TRUNCATE {tables} RESTART IDENTITY CASCADE"))
        db.session.commit()
        db.session.remove()


# ---------------------------------------------------------------------------
# the app fixture every test uses
# ---------------------------------------------------------------------------

@contextlib.contextmanager
def _test_app(postgres_uri, extra_config=None, nodeid="?"):
    """A test app on the selected backend; ``extra_config`` is merged on top.

    ``nodeid`` names the test in the leaked-sessions summary."""
    config = {**BASE_TEST_CONFIG, **(extra_config or {})}

    if postgres_uri is not None:
        app = create_app({**config, "SQLALCHEMY_DATABASE_URI": postgres_uri})
        with app.app_context():
            init_db(app)
        _truncate_all(app)
        try:
            yield app
        finally:
            with app.app_context():
                db.session.remove()
                # The alarm (B-068): a session this test left idle in a
                # transaction is attributed to it here, before the next test's
                # safety net releases it.
                _record_leaked_sessions(nodeid)
                db.session.remove()
                db.get_engine(app).dispose()
        return

    db_fd, db_path = tempfile.mkstemp()
    try:
        app = create_app({**config, "SQLALCHEMY_DATABASE_URI": f"sqlite:///{db_path}"})
        with app.app_context():
            init_db(app)
            event.listen(db.engine, "connect", _sqlite_fk_on)
            db.create_all()
        yield app
    finally:
        os.close(db_fd)
        os.unlink(db_path)


@pytest.fixture
def app(postgres_test_database_uri, request):
    with _test_app(postgres_test_database_uri, nodeid=request.node.nodeid) as app:
        yield app


@pytest.fixture
def app_with_config(postgres_test_database_uri, request):
    """Factory for a test that needs extra app config (e.g. cookie sessions).

    ``app_with_config({"SECRET_KEY": "…"})`` returns an app on the SAME backend
    as ``app`` — never a private SQLite file, so the Postgres run really covers
    the whole suite.
    """
    with contextlib.ExitStack() as stack:
        yield lambda extra_config=None: stack.enter_context(
            _test_app(postgres_test_database_uri, extra_config, nodeid=request.node.nodeid)
        )


@pytest.fixture
def client(app):
    return app.test_client()


@pytest.fixture
def runner(app):
    return app.test_cli_runner()


@pytest.fixture
def seed_users(app):
    with app.app_context():
        user1 = User(username="test", password="secret")
        user2 = User(username="other", password="secret2")
        db.session.add_all([user1, user2])
        db.session.commit()
        return [user1, user2]


class AuthActions:
    def __init__(self, client):
        self._client = client

    def login(self, username="test", password="secret"):
        return self._client.post(
            "/auth/login", data={"username": username, "password": password}
        )

    def logout(self):
        return self._client.get("/auth/logout")


@pytest.fixture
def auth(client):
    return AuthActions(client)
