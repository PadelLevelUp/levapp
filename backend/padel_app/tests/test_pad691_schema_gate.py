"""PAD-691 + PAD-696 — the schema gate, the migrate step, readiness and liveness.

Spec: ``delivery.zero-downtime-deploy`` rules 9-11. The schema reading runs against a scratch
SQLite file with a hand-made ``alembic_version`` (the reading is plain SQL, so the backend does
not matter); the advisory lock is Postgres-only and has its own test on the Postgres lane.
"""
import os
import subprocess
import sys
from pathlib import Path

import pytest
from sqlalchemy import create_engine, text

from padel_app import migrate as mg
from padel_app import schema_state as ss

BACKEND = Path(__file__).resolve().parents[2]
HEADS, KNOWN = ss.image_revisions()
HEAD = next(iter(HEADS))
OLDER = next(r for r in sorted(KNOWN) if r not in HEADS)
UNKNOWN = "f0f0f0f0f0f0"


@pytest.fixture
def engine(tmp_path):
    eng = create_engine(f"sqlite:///{tmp_path / 'schema.db'}")
    yield eng
    eng.dispose()


def stamp(engine, *revisions):
    with engine.begin() as conn:
        conn.execute(text("CREATE TABLE IF NOT EXISTS alembic_version (version_num VARCHAR(32) NOT NULL)"))
        conn.execute(text("DELETE FROM alembic_version"))
        for rev in revisions:
            conn.execute(text("INSERT INTO alembic_version VALUES (:r)"), {"r": rev})


def state_of(engine):
    with engine.connect() as conn:
        return ss.schema_state(conn)[0]


# --- the reading (rules 9-11) ---------------------------------------------------------------


def test_the_image_has_one_head_and_knows_it():
    assert len(HEADS) == 1 and HEADS <= KNOWN


@pytest.mark.parametrize(
    "db,expected",
    [
        (set(), ss.EMPTY),
        ({"h"}, ss.AT_HEAD),
        ({"a"}, ss.BEHIND),
        ({"x"}, ss.AHEAD),
        ({"h", "x"}, ss.AHEAD),
    ],
)
def test_classify(db, expected):
    assert ss.classify(db, frozenset({"h"}), frozenset({"a", "h"})) == expected


def test_the_four_states_read_from_a_database(engine):
    assert state_of(engine) == ss.EMPTY, "no alembic_version table"
    stamp(engine)
    assert state_of(engine) == ss.EMPTY, "a table with no row"
    stamp(engine, OLDER)
    assert state_of(engine) == ss.BEHIND
    stamp(engine, HEAD)
    assert state_of(engine) == ss.AT_HEAD
    stamp(engine, UNKNOWN)
    assert state_of(engine) == ss.AHEAD


def test_the_gate_is_off_unless_the_image_turns_it_on():
    assert not ss.gate_enabled({})
    assert not ss.gate_enabled({"SCHEMA_GATE": "off"})
    assert ss.gate_enabled({"SCHEMA_GATE": "on"})


# --- the boot gate (rule 10) ----------------------------------------------------------------


@pytest.fixture
def gate(engine, monkeypatch):
    monkeypatch.setattr(ss, "database_uri", lambda: str(engine.url))
    return lambda: ss.main(["--require", "not_behind"], {"SCHEMA_GATE": "on", "SCHEMA_GATE_DB_WAIT": "0"})


def test_a_stale_image_refuses_to_boot_and_says_why(engine, gate, capsys):
    stamp(engine, OLDER)
    assert gate() == 1
    out = capsys.readouterr().out
    assert "refusing to start: schema behind" in out and OLDER in out and HEAD in out
    assert "@" not in out and "sqlite" not in out, "no URI, no secret"


def test_an_empty_database_refuses_to_boot(engine, gate):
    assert gate() == 1


def test_at_head_boots(engine, gate):
    stamp(engine, HEAD)
    assert gate() == 0


def test_ahead_boots_with_a_warning(engine, gate, capsys):
    stamp(engine, UNKNOWN)
    assert gate() == 0
    assert "WARNING schema ahead" in capsys.readouterr().out


def test_gate_off_never_connects(monkeypatch, capsys):
    def boom():
        raise AssertionError("must not connect")

    monkeypatch.setattr(ss, "database_uri", boom)
    assert ss.main(["--require", "not_behind"], {"SCHEMA_GATE": "off"}) == 0
    assert "SCHEMA_GATE is off" in capsys.readouterr().out


def test_a_database_still_starting_is_retried(engine, monkeypatch):
    stamp(engine, HEAD)
    attempts = {"n": 0}
    real_connect = engine.connect

    class Flaky:
        dialect = engine.dialect

        def connect(self):
            attempts["n"] += 1
            if attempts["n"] < 3:
                raise ConnectionRefusedError("starting")
            return real_connect()

    monkeypatch.setattr(ss.time, "sleep", lambda s: None)
    state, _, _ = ss.read_state_with_retry(Flaky(), wait_seconds=30, log=lambda m: None)
    assert state == ss.AT_HEAD and attempts["n"] == 3


def test_a_database_that_never_answers_fails_after_the_wait(monkeypatch):
    class Down:
        def connect(self):
            raise ConnectionRefusedError("down")

    with pytest.raises(ConnectionRefusedError):
        ss.read_state_with_retry(Down(), wait_seconds=0, log=lambda m: None)


# --- the migrate step (rule 9) --------------------------------------------------------------


def upgrade_to(engine, *revisions, code=0):
    calls = []

    def upgrade():
        calls.append(1)
        if revisions:
            stamp(engine, *revisions)
        return code

    return upgrade, calls


def test_migrate_upgrades_a_schema_behind_and_ends_at_head(engine):
    stamp(engine, OLDER)
    upgrade, calls = upgrade_to(engine, HEAD)
    assert mg.migrate(engine, lock_timeout=1, upgrade=upgrade) == 0
    assert calls == [1]


def test_migrate_upgrades_an_empty_database(engine):
    upgrade, calls = upgrade_to(engine, HEAD)
    assert mg.migrate(engine, lock_timeout=1, upgrade=upgrade) == 0
    assert calls == [1]


@pytest.mark.parametrize("rev", ["head", "ahead"])
def test_migrate_does_nothing_at_head_or_ahead(engine, rev, capsys):
    stamp(engine, HEAD if rev == "head" else UNKNOWN)
    upgrade, calls = upgrade_to(engine, HEAD)
    assert mg.migrate(engine, lock_timeout=1, upgrade=upgrade) == 0
    assert calls == [], "an older image's upgrade cannot locate a newer revision"
    if rev == "ahead":
        assert "ahead of this image" in capsys.readouterr().out


def test_a_failed_upgrade_is_the_exit_code(engine):
    stamp(engine, OLDER)
    upgrade, _ = upgrade_to(engine, code=2)
    assert mg.migrate(engine, lock_timeout=1, upgrade=upgrade) == 2


def test_an_upgrade_that_does_not_reach_head_fails(engine, capsys):
    stamp(engine, OLDER)
    upgrade, _ = upgrade_to(engine)  # exits 0, schema unchanged
    assert mg.migrate(engine, lock_timeout=1, upgrade=upgrade) == 1
    assert "expected at head" in capsys.readouterr().out


class FakeLockConn:
    def __init__(self, free_after):
        self.tries, self.free_after = 0, free_after

    def execute(self, *_a, **_k):
        self.tries += 1
        return type("R", (), {"scalar": lambda _s: self.tries > self.free_after})()


def fake_clock():
    t = {"now": 0.0}
    return (lambda: t["now"]), (lambda s: t.__setitem__("now", t["now"] + s))


def test_the_lock_wait_reports_and_gives_up(capsys):
    clock, sleep = fake_clock()
    held = mg.acquire_lock(FakeLockConn(free_after=10_000), timeout=65, clock=clock, sleep=sleep)
    assert held is False
    assert capsys.readouterr().out.count("waiting for migrate lock") == 2


def test_the_lock_is_taken_once_free():
    clock, sleep = fake_clock()
    assert mg.acquire_lock(FakeLockConn(free_after=3), timeout=65, clock=clock, sleep=sleep) is True


def test_the_migrate_lock_is_not_the_scheduler_lock():
    from padel_app.scheduler_leadership import SCHEDULER_LOCK_KEY

    assert mg.MIGRATE_LOCK_KEY != SCHEDULER_LOCK_KEY


def test_a_held_lock_times_out_with_exit_3_on_postgres(postgres_test_database_uri, capsys):
    if postgres_test_database_uri is None:
        pytest.skip("Postgres lane only (LEVAPP_TEST_DB=postgres)")
    eng = create_engine(postgres_test_database_uri)
    other = eng.connect().execution_options(isolation_level="AUTOCOMMIT")
    try:
        assert other.execute(text("SELECT pg_try_advisory_lock(:k)"), {"k": mg.MIGRATE_LOCK_KEY}).scalar()
        upgrade, calls = upgrade_to(eng, HEAD)
        assert mg.migrate(eng, lock_timeout=2, upgrade=upgrade) == mg.LOCK_TIMEOUT_EXIT
        assert calls == []
    finally:
        other.execute(text("SELECT pg_advisory_unlock(:k)"), {"k": mg.MIGRATE_LOCK_KEY})
        other.close()
        eng.dispose()


# --- readiness and liveness (rule 11) -------------------------------------------------------


@pytest.fixture
def gated(app, monkeypatch):
    from padel_app.modules import frontend_api
    from padel_app.sql_db import db

    monkeypatch.setenv("SCHEMA_GATE", "on")
    frontend_api._schema_reading.update(at=None, value=None)
    with app.app_context(), db.engine.connect() as conn:
        original = ss.read_db_revisions(conn)
    def set_revisions(*revs, reset_cache=True):
        with app.app_context():
            stamp(db.engine, *revs)
        if reset_cache:
            frontend_api._schema_reading.update(at=None, value=None)

    yield set_revisions
    # R-037: the Postgres lane shares one migrated database per session; put its version back.
    if original:
        set_revisions(*original)
    frontend_api._schema_reading.update(at=None, value=None)


def test_livez_never_touches_the_database(client, monkeypatch):
    from padel_app.sql_db import db

    def boom(*a, **k):
        raise RuntimeError("db down")

    monkeypatch.setattr(db.session, "execute", boom)
    r = client.get("/api/app/livez")
    assert r.status_code == 200 and r.get_json() == {"status": "ok"}
    assert client.get("/api/app/healthz").status_code == 503


def test_healthz_is_503_while_the_schema_is_behind(client, gated):
    gated(OLDER)
    r = client.get("/api/app/healthz")
    assert r.status_code == 503 and r.get_json()["status"] == "schema_behind"
    assert client.get("/api/app/livez").status_code == 200


def test_healthz_is_ready_at_head_and_ahead(client, gated):
    gated(HEAD)
    assert client.get("/api/app/healthz").get_json() == {"status": "ok"}
    gated(UNKNOWN)
    r = client.get("/api/app/healthz")
    assert r.status_code == 200 and r.get_json() == {"status": "schema_ahead"}


def test_healthz_reads_the_schema_at_most_every_ten_seconds(client, gated):
    gated(HEAD)
    assert client.get("/api/app/healthz").status_code == 200
    gated(OLDER, reset_cache=False)  # still the cached reading
    assert client.get("/api/app/healthz").status_code == 200


def test_without_the_gate_healthz_ignores_the_schema(client, monkeypatch):
    monkeypatch.delenv("SCHEMA_GATE", raising=False)
    assert client.get("/api/app/healthz").status_code == 200  # create_all, no alembic_version


# --- the image (rule 10) --------------------------------------------------------------------


def test_the_entrypoint_gates_and_never_migrates():
    script = (BACKEND / "scripts" / "entrypoint.sh").read_text()
    assert "db upgrade" not in script
    gate_at = script.index("python -m padel_app.schema_state --require not_behind")
    assert gate_at < script.rindex('exec "$@"')
    assert "set -e" in script


def test_the_image_turns_the_gate_on_and_ships_the_migrate_step():
    dockerfile = (BACKEND / "Dockerfile").read_text()
    assert "ENV SCHEMA_GATE=on" in dockerfile
    assert "/app/scripts/migrate.sh" in dockerfile
    migrate_sh = (BACKEND / "scripts" / "migrate.sh").read_text()
    assert "exec python -m padel_app.migrate" in migrate_sh
    assert os.access(BACKEND / "scripts" / "migrate.sh", os.X_OK)


def test_the_migrate_step_is_the_one_command_the_gate_lets_through(tmp_path):
    """Found by the docker smoke run: `docker run <image> /app/scripts/migrate.sh` goes through the
    entrypoint too, and the gate refused the empty database the step was there to migrate."""
    script = (BACKEND / "scripts" / "entrypoint.sh").read_text().replace(
        "python -m padel_app.schema_state --require not_behind", "echo GATE-RAN; exit 1"
    )
    entry = tmp_path / "entrypoint.sh"
    entry.write_text(script)
    env = {**os.environ}
    r = subprocess.run(["sh", str(entry), "/app/scripts/migrate.sh"], capture_output=True, text=True, env=env)
    assert "GATE-RAN" not in r.stdout
    for cmd in ("gunicorn", "scripts/migrate.sh"):  # only the image's absolute path bypasses the gate
        r = subprocess.run(["sh", str(entry), cmd], capture_output=True, text=True, env=env)
        assert "GATE-RAN" in r.stdout and r.returncode == 1, cmd


def test_the_entrypoint_refuses_a_stale_database_end_to_end(tmp_path):
    """The real entrypoint, a real (SQLite) database behind head: exit 1 before the command runs."""
    db_file = tmp_path / "stale.db"
    eng = create_engine(f"sqlite:///{db_file}")
    stamp(eng, OLDER)
    eng.dispose()
    marker = tmp_path / "ran"
    env = {
        **os.environ,
        "SCHEMA_GATE": "on",
        "SCHEMA_GATE_DB_WAIT": "0",
        "PYTHONPATH": str(BACKEND),
        "SCHEMA_STATE_TEST_URI": f"sqlite:///{db_file}",
    }
    wrapper = tmp_path / "gate.py"
    wrapper.write_text(
        "import os, sys\n"
        f"sys.path.insert(0, {str(BACKEND)!r})\n"
        "from padel_app import schema_state as ss\n"
        "ss.database_uri = lambda: os.environ['SCHEMA_STATE_TEST_URI']\n"
        "sys.exit(ss.main(['--require', 'not_behind']))\n"
    )
    script = (BACKEND / "scripts" / "entrypoint.sh").read_text().replace(
        "python -m padel_app.schema_state --require not_behind", f"{sys.executable} {wrapper}"
    )
    entry = tmp_path / "entrypoint.sh"
    entry.write_text(script)
    env["PYTHONPATH"] = str(BACKEND)
    r = subprocess.run(["sh", str(entry), "touch", str(marker)], env=env, capture_output=True, text=True, cwd=BACKEND)
    assert r.returncode == 1, r.stdout + r.stderr
    assert not marker.exists(), "the app command never ran"
    assert "refusing to start" in r.stdout
