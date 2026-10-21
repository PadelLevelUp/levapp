"""PAD-692 — two app processes on one Postgres: an event published in A reaches a stream held by B.

`messaging.sse-realtime` rules 20-24. The registry of open streams is per-process, so this cannot
be shown with two apps in one interpreter: the module state would be shared. Two OS processes
(`two_process_app`) run against the session's scratch database.

Ordering (race-cell rule, ledger B-068's sibling): B's stream is opened, its `: connected` chunk
read (the slot is registered by then), and then the harness waits for B's listener to log
`LISTEN ready` — written from inside the listener after LISTEN returned, so "process started" is
never mistaken for "listening". Only then does A publish.

The 2×2: every delivery cell runs with `SSE_BROKER=postgres` (must arrive) and `memory` (must
not), so a pass shows the harness can tell the broker from its absence.

Marked ``two_process``: deselected unless ``LEVAPP_TWO_PROCESS=1`` (the Postgres CI lane sets it).
"""
import json
import os
import queue
import socket
import subprocess
import sys
import threading
import time
from pathlib import Path

import pytest
import requests

from padel_app.tests.two_process_app import READY_LINE

pytestmark = [
    pytest.mark.two_process,
    pytest.mark.skipif(
        os.getenv("LEVAPP_TEST_DB", "sqlite").strip().lower() != "postgres",
        reason="LISTEN/NOTIFY needs Postgres",
    ),
]

BACKEND = Path(__file__).resolve().parents[2]
LISTEN_READY = "realtime listener: LISTEN ready"


def _free_port():
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


class Proc:
    """One harness process; its stderr lines are collected for the readiness waits."""

    def __init__(self, uri, broker, extra_env=None):
        self.port = _free_port()
        env = {
            **os.environ,
            "HARNESS_DATABASE_URI": uri,
            "SSE_BROKER": broker,
            "PYTHONPATH": str(BACKEND),
            **(extra_env or {}),
        }
        self.proc = subprocess.Popen(
            [sys.executable, "-m", "padel_app.tests.two_process_app", str(self.port)],
            cwd=BACKEND, env=env, stderr=subprocess.PIPE, stdout=subprocess.DEVNULL, text=True,
        )
        self.lines = []
        self._cv = threading.Condition()
        threading.Thread(target=self._pump, daemon=True).start()
        self.wait_for(READY_LINE, 30)

    def _pump(self):
        for line in self.proc.stderr:
            with self._cv:
                self.lines.append(line.rstrip("\n"))
                self._cv.notify_all()

    def wait_for(self, text, timeout, after=0):
        deadline = time.monotonic() + timeout
        with self._cv:
            while True:
                if any(text in line for line in self.lines[after:]):
                    return True
                left = deadline - time.monotonic()
                if left <= 0 or self.proc.poll() is not None:
                    return False
                self._cv.wait(left)

    def count(self, text):
        with self._cv:
            return sum(text in line for line in self.lines)

    @property
    def base(self):
        return f"http://127.0.0.1:{self.port}"

    def stop(self):
        self.proc.terminate()
        try:
            self.proc.wait(10)
        except subprocess.TimeoutExpired:
            self.proc.kill()


class Stream:
    """An open `/api/app/events` stream read on its own thread; `data:` events land in a queue."""

    def __init__(self, proc, token):
        self.events = queue.Queue()
        self.connected = threading.Event()
        self._resp = requests.get(f"{proc.base}/api/app/events", params={"token": token},
                                  stream=True, timeout=(5, 30))
        assert self._resp.status_code == 200, self._resp.text
        threading.Thread(target=self._read, daemon=True).start()
        assert self.connected.wait(5), "no ': connected' chunk"

    def _read(self):
        try:
            for line in self._resp.iter_lines(decode_unicode=True):
                if line == ": connected":
                    self.connected.set()
                elif line and line.startswith("data: "):
                    self.events.put(line[len("data: "):])
        except Exception:  # noqa: BLE001 — the stream closed under us at teardown
            pass

    def next(self, timeout):
        try:
            return self.events.get(timeout=timeout)
        except queue.Empty:
            return None

    def close(self):
        self._resp.close()


@pytest.fixture
def users(app):
    from padel_app.models import User
    from padel_app.sql_db import db

    with app.app_context():
        rows = [User(name=f"Two {i}", username=f"pad692_{i}", password="x", status="active") for i in range(2)]
        db.session.add_all(rows)
        db.session.commit()
        return [row.id for row in rows]


def _token(app, user_id):
    from flask_jwt_extended import create_access_token

    from padel_app.tests.two_process_app import JWT_SECRET

    app.config["JWT_SECRET_KEY"] = JWT_SECRET
    with app.app_context():
        return create_access_token(identity=str(user_id))


@pytest.fixture
def pair(app, postgres_test_database_uri):
    started = []

    def start(broker):
        a = Proc(postgres_test_database_uri, broker)
        started.append(a)
        b = Proc(postgres_test_database_uri, broker)
        started.append(b)
        return a, b

    yield start
    for p in started:
        p.stop()


def _open_ready(b, broker, token):
    """Open a stream on B and, with the Postgres broker, wait until B's listener is LISTENing."""
    stream = Stream(b, token)
    if broker == "postgres":
        assert b.wait_for(LISTEN_READY, 10), "B's listener never reported LISTEN ready:\n" + "\n".join(b.lines[-20:])
        # This stream started B's listener, so it was open before the first LISTEN: rule 24's resync.
        first = stream.next(timeout=3)
        assert first is not None and json.loads(first) == {"type": "resync"}, first
    return stream


def _publish(proc, event, user_ids):
    r = requests.post(f"{proc.base}/__harness/publish", json={"event": event, "user_ids": user_ids}, timeout=10)
    assert r.status_code == 200, r.text


@pytest.mark.parametrize("broker", ["postgres", "memory"])
def test_event_published_in_a_reaches_stream_on_b(app, users, pair, broker):
    a, b = pair(broker)
    u = users[0]
    stream = _open_ready(b, broker, _token(app, u))
    event = {"type": "message_created", "payload": {"id": 1, "content": "olá", "conversationId": 7}}

    sent = time.monotonic()
    _publish(a, event, [u])
    got = stream.next(timeout=2 if broker == "postgres" else 3)
    stream.close()

    if broker == "postgres":
        assert got is not None, "the event never crossed from A to B"
        assert time.monotonic() - sent < 1.0 + 0.5  # rule: within 1 s (+ read slack)
        assert got == json.dumps(event)  # byte-identical to a local delivery
    else:
        assert got is None, "with the memory broker nothing may cross processes"


@pytest.mark.parametrize("broker", ["postgres", "memory"])
def test_body_over_8kb_crosses(app, users, pair, broker):
    a, b = pair(broker)
    u = users[0]
    stream = _open_ready(b, broker, _token(app, u))
    event = {"type": "message_created", "payload": {"id": 2, "content": "x" * 20_000}}

    _publish(a, event, [u])
    got = stream.next(timeout=3)
    stream.close()

    if broker == "postgres":
        assert got is not None and json.loads(got)["payload"]["content"] == "x" * 20_000
    else:
        assert got is None


def test_cross_process_delivery_keeps_scoping(app, users, pair):
    a, b = pair("postgres")
    u, v = users
    su = _open_ready(b, "postgres", _token(app, u))
    sv = Stream(b, _token(app, v))

    _publish(a, {"type": "notify_sent", "payload": {"count": 1}}, [u])
    assert su.next(timeout=3) is not None
    assert sv.next(timeout=1.5) is None, "V is not a recipient"
    su.close()
    sv.close()


def test_listener_drop_ends_in_resync_then_delivery(app, users, pair):
    from sqlalchemy import create_engine, text

    a, b = pair("postgres")
    u = users[0]
    stream = _open_ready(b, "postgres", _token(app, u))
    ready_before = b.count(LISTEN_READY)

    admin = create_engine(app.config["SQLALCHEMY_DATABASE_URI"])
    with admin.begin() as conn:
        killed = conn.execute(text(
            "SELECT pg_terminate_backend(pid) FROM pg_stat_activity "
            "WHERE application_name = 'levapp-realtime-listener' AND datname = current_database()"
        )).all()
    admin.dispose()
    assert killed, "no listener connection to terminate"

    resync = stream.next(timeout=10)
    assert resync is not None and json.loads(resync) == {"type": "resync"}
    assert b.count(LISTEN_READY) > ready_before  # it really re-LISTENed

    event = {"type": "message_deleted", "payload": {"id": 3, "conversationId": 7}}
    _publish(a, event, [u])
    after = stream.next(timeout=3)
    stream.close()
    assert after == json.dumps(event)
