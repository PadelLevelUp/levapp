"""PAD-718 — the migrate step's session timeouts (delivery.zero-downtime-deploy rule 12).

The previous release serves while ``padel_app.migrate`` runs ``flask db upgrade``, so the upgrade's
session gets a ``lock_timeout`` (an ALTER never queues behind a long query, and the API's queries
behind it, for longer) and a ``statement_timeout``. A lock timeout rolls the one upgrade transaction
back and exits 75, the only code retried. The Postgres tests run the real ``env.py`` against a
scratch database and a two-revision migrations directory: a held ACCESS SHARE lock makes the ALTER
time out, and the schema stays at the previous revision.
"""
import os
import shutil
import subprocess
import sys
import time
from pathlib import Path

import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.pool import NullPool

from padel_app import migrate as mg
from padel_app.tests.conftest import _drop_database, _postgres_settings, _run_admin

BACKEND = Path(__file__).resolve().parents[2]
MIGRATIONS = BACKEND / "migrations"


# --- the retry loop and the subprocess it runs ---------------------------------------------------

def _codes(*codes):
    calls = []

    def upgrade():
        calls.append(1)
        return codes[len(calls) - 1]
    return upgrade, calls


def test_a_lock_timeout_is_retried_with_backoff_and_then_succeeds(capsys):
    upgrade, calls = _codes(75, 75, 0)
    slept = []
    assert mg.upgrade_with_retries(upgrade, attempts=4, sleep=slept.append) == 0
    assert len(calls) == 3 and slept == [5, 10]
    out = capsys.readouterr().out
    assert "lock_timeout on attempt 1/4" in out and "retrying in 5s" in out and "retrying in 10s" in out


def test_the_retries_are_bounded(capsys):
    upgrade, calls = _codes(75, 75, 75, 75, 0)
    slept = []
    assert mg.upgrade_with_retries(upgrade, attempts=4, sleep=slept.append) == mg.LOCK_BUSY_EXIT
    assert len(calls) == 4 and slept == [5, 10, 20]
    assert "lock_timeout on attempt 4/4: giving up; the schema is where it was" in capsys.readouterr().out


@pytest.mark.parametrize("code", [1, 2, 0])
def test_any_other_exit_is_final(code):
    upgrade, calls = _codes(code, 0)
    slept = []
    assert mg.upgrade_with_retries(upgrade, attempts=4, sleep=slept.append) == code
    assert len(calls) == 1 and slept == []  # a statement_timeout (57014) is exit 1: never retried


def test_run_upgrade_turns_the_session_timeouts_on(monkeypatch):
    seen = {}

    def fake_run(cmd, cwd, env):
        seen.update(cmd=cmd, cwd=cwd, env=env)
        return subprocess.CompletedProcess(cmd, 0)

    monkeypatch.setattr(mg.subprocess, "run", fake_run)
    assert mg.run_upgrade({"PATH": "/bin"}) == 0
    assert seen["cmd"][-2:] == ["db", "upgrade"]
    assert "-d" not in seen["cmd"]
    assert seen["env"]["LEVAPP_MIGRATE_STEP"] == "1"
    assert seen["env"]["MIGRATE_DDL_LOCK_TIMEOUT"] == "3" and seen["env"]["MIGRATE_STATEMENT_TIMEOUT"] == "300"
    mg.run_upgrade({"MIGRATE_DDL_LOCK_TIMEOUT": "1.5", "MIGRATE_DIRECTORY": "/tmp/m"})
    assert seen["env"]["MIGRATE_DDL_LOCK_TIMEOUT"] == "1.5" and seen["cmd"][-2:] == ["-d", "/tmp/m"]


def test_main_logs_the_timeouts_once_and_passes_the_attempts(monkeypatch, capsys):
    got = {}
    monkeypatch.setattr(mg.ss, "database_uri", lambda: "sqlite://")
    monkeypatch.setattr(mg, "migrate", lambda engine, **kw: got.update(kw) or 0)
    assert mg.main({"MIGRATE_ATTEMPTS": "2", "MIGRATE_STATEMENT_TIMEOUT": "120"}) == 0
    out = capsys.readouterr().out
    assert out.count("session timeouts:") == 1
    assert "lock_timeout 3s, statement_timeout 120s, 2 attempt(s), backoff 5/10/20s (PAD-718)" in out
    assert got["attempts"] == 2 and got["backoff"] == (5, 10, 20) and got["lock_timeout"] == 1500


def test_env_py_sets_the_timeouts_only_under_the_migrate_flag():
    env_py = (MIGRATIONS / "env.py").read_text()
    assert 'os.environ.get("LEVAPP_MIGRATE_STEP") != "1"' in env_py
    assert 'connection.execute(text(f"SET lock_timeout = {lock_ms}"))' in env_py
    assert 'getattr(exc.orig, "pgcode", None) == LOCK_NOT_AVAILABLE' in env_py
    assert "raise SystemExit(LOCK_BUSY_EXIT)" in env_py and "LOCK_BUSY_EXIT = 75" in env_py
    # The SETs run inside alembic's transaction: before it, SQLAlchemy 1.4 opens one that alembic
    # treats as external and never commits.
    begin = env_py.index("with context.begin_transaction():\n                # Inside")
    assert begin < env_py.index('SET lock_timeout')


# --- the real env.py, a held lock, a scratch Postgres database ----------------------------------

REV1 = '''"""pad718 r1"""
from alembic import op

revision = "pad718r1"
down_revision = None


def upgrade():
    op.execute("CREATE TABLE pad718_t (id integer PRIMARY KEY)")


def downgrade():
    op.execute("DROP TABLE pad718_t")
'''

REV2 = '''"""pad718 r2: needs ACCESS EXCLUSIVE on pad718_t"""
from alembic import op

revision = "pad718r2"
down_revision = "pad718r1"


def upgrade():
    op.execute("ALTER TABLE pad718_t ADD COLUMN note text")


def downgrade():
    op.execute("ALTER TABLE pad718_t DROP COLUMN note")
'''


@pytest.fixture
def scratch(tmp_path, postgres_test_database_uri):
    if postgres_test_database_uri is None:
        pytest.skip("Postgres lane only (LEVAPP_TEST_DB=postgres)")
    settings = _postgres_settings()
    name = f"levelup_pytest_pad718_{os.getpid()}"
    _drop_database(settings, name)
    _run_admin(settings, [(f'CREATE DATABASE "{name}"', None)])
    mdir = tmp_path / "migrations"
    (mdir / "versions").mkdir(parents=True)
    for f in ("alembic.ini", "env.py", "script.py.mako"):
        shutil.copy(MIGRATIONS / f, mdir / f)
    (mdir / "versions" / "pad718r1.py").write_text(REV1)
    (mdir / "versions" / "pad718r2.py").write_text(REV2)
    # The same server the scratch database was created on (an app dotenv may name another port).
    environ = {**os.environ, "POSTGRES_HOST": settings["host"], "POSTGRES_PORT": str(settings["port"]),
               "POSTGRES_DB": name, "MIGRATE_DIRECTORY": str(mdir), "MIGRATE_DDL_LOCK_TIMEOUT": "1"}
    first = subprocess.run([sys.executable, "-m", "flask", "--app", "app.py", "db", "upgrade", "pad718r1", "-d", str(mdir)],
                           cwd=BACKEND, env=environ, capture_output=True, text=True, timeout=120)
    assert first.returncode == 0, first.stderr[-2000:]
    uri = postgres_test_database_uri.rsplit("/", 1)[0] + f"/{name}"
    engine = create_engine(uri, poolclass=NullPool)
    holder = engine.connect()
    tx = holder.begin()
    holder.execute(text("LOCK TABLE pad718_t IN ACCESS SHARE MODE"))  # a long read, as far as ALTER knows
    yield {"engine": engine, "environ": environ, "release": tx.commit, "holder": holder}
    if tx.is_active:
        tx.rollback()
    holder.close()
    engine.dispose()
    _drop_database(settings, name)


def _state(engine):
    with engine.connect() as c:
        rev = c.execute(text("SELECT version_num FROM alembic_version")).scalar()
        cols = {r[0] for r in c.execute(text(
            "SELECT column_name FROM information_schema.columns WHERE table_name = 'pad718_t'"))}
    return rev, cols


def _patch_heads(monkeypatch, scratch):
    # The migrate step compares against the image's heads; here the image is the scratch directory.
    real = mg.ss.schema_state
    mdir = scratch["environ"]["MIGRATE_DIRECTORY"]
    monkeypatch.setattr(mg.ss, "schema_state", lambda connection: real(connection, mdir))


def test_a_blocked_lock_fails_the_step_within_the_bound_and_leaves_the_previous_head(scratch, monkeypatch, capfd):
    _patch_heads(monkeypatch, scratch)
    t0 = time.monotonic()
    code = mg.migrate(scratch["engine"], lock_timeout=5, upgrade=lambda: mg.run_upgrade(scratch["environ"]),
                      attempts=2, backoff=(0,), sleep=lambda s: None)
    elapsed = time.monotonic() - t0
    assert code == mg.LOCK_BUSY_EXIT
    assert _state(scratch["engine"]) == ("pad718r1", {"id"}), "rolled back: no half-applied revision"
    out = capfd.readouterr()
    text_out = out.out + out.err
    assert text_out.count("lock_timeout: ") == 2, text_out[-3000:]  # env.py, once per attempt
    assert "lock_timeout on attempt 1/2" in text_out and "giving up" in text_out
    assert elapsed < 60, f"two attempts at a 1 s lock_timeout took {elapsed:.0f}s"


def test_a_lock_released_between_attempts_lets_the_retry_reach_head(scratch, monkeypatch, capfd):
    _patch_heads(monkeypatch, scratch)
    code = mg.migrate(scratch["engine"], lock_timeout=5, upgrade=lambda: mg.run_upgrade(scratch["environ"]),
                      attempts=3, backoff=(0,), sleep=lambda s: scratch["release"]())
    assert code == 0
    assert _state(scratch["engine"]) == ("pad718r2", {"id", "note"})
    text_out = "".join(capfd.readouterr())
    assert text_out.count("lock_timeout: ") == 1 and "lock_timeout on attempt 1/3" in text_out


def test_a_plain_upgrade_sets_no_timeout(scratch):
    """Without the migrate flag env.py sets nothing: the ALTER waits (here, past a 4 s cap)."""
    env = {k: v for k, v in scratch["environ"].items() if k != "LEVAPP_MIGRATE_STEP"}
    with pytest.raises(subprocess.TimeoutExpired):
        subprocess.run([sys.executable, "-m", "flask", "--app", "app.py", "db", "upgrade", "-d", env["MIGRATE_DIRECTORY"]],
                       cwd=BACKEND, env=env, capture_output=True, timeout=4 + 6)
