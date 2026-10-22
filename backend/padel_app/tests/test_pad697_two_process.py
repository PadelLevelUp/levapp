"""PAD-697 — an API process and an events process (gunicorn's gevent worker) on one Postgres.

`delivery.events-role`. Process A is the API (the PAD-692 harness process, threads). Process B is
the events role exactly as scripts/serve.sh starts it — `--config gunicorn_events.conf.py
--workers 1 --worker-class gevent` (psycogreen from post_fork) — only bound to a loopback port and
pointed at the harness app factory. B is waited for on its own readiness, which for this role means
"LISTEN is up" (R1): the race-cell rule's signal from inside the thing that must be ready.

Marked ``two_process``: deselected unless ``LEVAPP_TWO_PROCESS=1`` (the Postgres CI lane sets it).
"""
import json
import os
import pathlib
import subprocess
import sys
import threading
import time

import pytest
import requests

from padel_app.tests.test_pad692_two_process import BACKEND, Proc, Stream, _free_port, _publish
from padel_app.tests.git_env import git_env

pytestmark = [
    pytest.mark.two_process,
    pytest.mark.skipif(
        os.getenv("LEVAPP_TEST_DB", "sqlite").strip().lower() != "postgres",
        reason="LISTEN/NOTIFY needs Postgres",
    ),
]


class EventsProc:
    """B: the events role under gunicorn's gevent worker."""

    def __init__(self, uri, extra_env=None):
        self.port = _free_port()
        env = {
            **os.environ, "HARNESS_DATABASE_URI": uri, "SSE_BROKER": "postgres", "ROLE": "events",
            "PYTHONPATH": str(BACKEND), **(extra_env or {}),
        }
        gunicorn = pathlib.Path(sys.executable).with_name("gunicorn")
        self.proc = subprocess.Popen(
            [str(gunicorn), "--config", str(BACKEND / "gunicorn_events.conf.py"), "--bind", f"127.0.0.1:{self.port}",
             "--workers", "1", "--worker-class", "gevent", "--worker-connections", "1200", "--timeout", "60",
             "padel_app.tests.two_process_app:build_app()"],
            cwd=BACKEND, env=env, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, text=True,
        )
        self.lines = []
        threading.Thread(target=lambda: [self.lines.append(l.rstrip()) for l in self.proc.stderr], daemon=True).start()
        assert self.wait_ready(30), "B never became ready:\n" + "\n".join(self.lines[-30:])

    @property
    def base(self):
        return f"http://127.0.0.1:{self.port}"

    def health(self):
        try:
            r = requests.get(f"{self.base}/api/app/healthz", timeout=2)
            return r.status_code, r.json().get("status")
        except requests.RequestException:
            return None, None

    def wait_ready(self, timeout, want=200):
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            if self.proc.poll() is not None:
                return False
            if self.health()[0] == want:
                return True
            time.sleep(0.1)
        return False

    def worker_pid(self):
        out = subprocess.run(["pgrep", "-P", str(self.proc.pid)], capture_output=True, text=True, env=git_env()).stdout.split()
        return int(out[0]) if out else self.proc.pid

    def os_threads(self):
        pid = self.worker_pid()
        status = pathlib.Path(f"/proc/{pid}/status")
        if status.exists():
            return int(next(l.split()[1] for l in status.read_text().splitlines() if l.startswith("Threads:")))
        out = subprocess.run(["ps", "-M", "-p", str(pid)], capture_output=True, text=True, env=git_env()).stdout
        return max(len(out.strip().splitlines()) - 1, 0)

    def stop(self):
        self.proc.terminate()
        try:
            self.proc.wait(15)
        except subprocess.TimeoutExpired:
            self.proc.kill()


def _users(app, n):
    from padel_app.models import User
    from padel_app.sql_db import db

    with app.app_context():
        rows = [User(name=f"Ev {i}", username=f"pad697_{i}", password="x", status="active") for i in range(n)]
        db.session.add_all(rows)
        db.session.commit()
        return [r.id for r in rows]


def _token(app, user_id):
    from flask_jwt_extended import create_access_token

    from padel_app.tests.two_process_app import JWT_SECRET

    app.config["JWT_SECRET_KEY"] = JWT_SECRET
    with app.app_context():
        return create_access_token(identity=str(user_id))


@pytest.fixture
def pair(app, postgres_test_database_uri):
    a = Proc(postgres_test_database_uri, "postgres")
    b = EventsProc(postgres_test_database_uri)
    yield a, b
    b.stop()
    a.stop()


def _first(stream, timeout):
    """The first data event, skipping the first-LISTEN resync a stream opened at boot may get."""
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        got = stream.next(timeout=max(0.05, deadline - time.monotonic()))
        if got is None:
            return None
        if json.loads(got).get("type") != "resync":
            return got
    return None


def test_an_event_published_by_the_api_reaches_a_stream_held_by_the_gevent_events_process(app, pair):
    a, b = pair
    (u,) = _users(app, 1)
    stream = Stream(b, _token(app, u))
    event = {"type": "message_created", "payload": {"id": 1, "content": "olá"}}
    sent = time.monotonic()
    _publish(a, event, [u])
    got = _first(stream, 3)
    stream.close()
    assert got == json.dumps(event)
    assert time.monotonic() - sent < 1.5


def test_the_events_process_serves_only_the_stream(app, pair):
    _, b = pair
    r = requests.get(f"{b.base}/api/app/messages/unread_count", timeout=5)
    assert r.status_code == 404 and r.json() == {"error": "NOT_ON_EVENTS"}


def test_a_listener_drop_unreadies_then_readies_the_events_process_and_resyncs(app, pair):
    from sqlalchemy import create_engine, text

    a, b = pair
    (u,) = _users(app, 1)
    stream = Stream(b, _token(app, u))
    engine = create_engine(app.config["SQLALCHEMY_DATABASE_URI"])
    with engine.begin() as conn:
        killed = conn.execute(text(
            "SELECT pg_terminate_backend(pid) FROM pg_stat_activity "
            "WHERE application_name = 'levapp-realtime-listener' AND datname = current_database()"
        )).all()
    engine.dispose()
    assert killed
    assert b.wait_ready(5, want=503), "readiness never dropped after the listener died"
    assert b.health()[1] in ("listener_down", "ok")
    assert b.wait_ready(15), "readiness never came back after the reconnect"
    seen = [stream.next(timeout=5)]
    stream.close()
    assert any(s and json.loads(s) == {"type": "resync"} for s in seen)


def test_three_hundred_streams_ride_greenlets_not_threads(app, pair):
    a, b = pair
    users = _users(app, 75)  # 4 streams each: the per-user cap
    threads_before = b.os_threads()
    streams = [Stream(b, _token(app, u)) for u in users for _ in range(4)]
    try:
        threads_during = b.os_threads()
        _publish(a, {"type": "notify_sent", "payload": {"n": 300}}, users)
        got = [_first(s, 5) for s in streams]
    finally:
        for s in streams:
            s.close()
    assert sum(g is not None for g in got) == 300, "every one of the 300 streams receives the event"
    # A thread per stream would add ~300; gevent adds none per stream.
    assert threads_during - threads_before < 20, (threads_before, threads_during)
