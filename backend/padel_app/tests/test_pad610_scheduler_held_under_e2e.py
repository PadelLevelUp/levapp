"""PAD-610 — the E2E backend's scheduler never races global-setup's reseed.

Playwright starts the configured webServers BEFORE global-setup runs, so the
backend's APScheduler was already running its startup reschedule and its
30-second batch job while `reset-test-db.sh` dropped and recreated the tables:
Postgres reported a deadlock and the run died before its first test. Under
E2E_SCHEDULER_HELD the scheduler starts paused and does nothing until the debug
release endpoint is called once the database is ready. Default off.
"""
import pytest

import padel_app.scheduler as scheduler_mod


class _FakeScheduler:
    """Records what init_scheduler and release_scheduler ask of it."""

    def __init__(self, *args, **kwargs):
        from apscheduler.schedulers.base import STATE_PAUSED, STATE_RUNNING, STATE_STOPPED
        self._states = {"paused": STATE_PAUSED, "running": STATE_RUNNING}
        self.state = STATE_STOPPED
        self.calls = []

    def add_job(self, *args, **kwargs):
        pass

    def add_listener(self, *args, **kwargs):
        pass

    def start(self, paused=False):
        self.calls.append(("start", paused))
        self.state = self._states["paused" if paused else "running"]

    def resume(self):
        self.calls.append(("resume",))
        self.state = self._states["running"]

    def shutdown(self, wait=True):
        pass


@pytest.fixture
def fake(monkeypatch):
    import apscheduler.schedulers.background as bg

    made = []

    def _make(*args, **kwargs):
        s = _FakeScheduler()
        made.append(s)
        return s

    monkeypatch.setattr(bg, "BackgroundScheduler", _make)
    monkeypatch.setattr(scheduler_mod, "_scheduler", None)
    monkeypatch.setattr(scheduler_mod, "_app", None)
    monkeypatch.setattr(scheduler_mod.sys, "argv", ["flask", "run", "--port", "5314", "--no-reload"])
    monkeypatch.setenv("TEST_MODE", "true")
    monkeypatch.delenv("WERKZEUG_RUN_MAIN", raising=False)
    monkeypatch.setattr(scheduler_mod.atexit, "register", lambda *_: None)
    reschedules = []
    monkeypatch.setattr(scheduler_mod, "_startup_reschedule", lambda app: reschedules.append(app))
    return made, reschedules


def test_without_the_flag_the_scheduler_starts_running_and_reschedules_at_boot(app, monkeypatch, fake):
    made, reschedules = fake
    monkeypatch.delenv("E2E_SCHEDULER_HELD", raising=False)
    scheduler_mod.init_scheduler(app)
    assert made[0].calls == [("start", False)]
    assert reschedules == [app]


def test_held_the_scheduler_starts_paused_and_touches_nothing(app, monkeypatch, fake):
    made, reschedules = fake
    monkeypatch.setenv("E2E_SCHEDULER_HELD", "1")
    scheduler_mod.init_scheduler(app)
    assert made[0].calls == [("start", True)]
    assert reschedules == []


def test_release_reschedules_once_then_resumes_and_is_idempotent(app, monkeypatch, fake):
    made, reschedules = fake
    monkeypatch.setenv("E2E_SCHEDULER_HELD", "1")
    scheduler_mod.init_scheduler(app)
    assert scheduler_mod.release_scheduler(app) == {"released": True, "state": "running"}
    assert reschedules == [app]
    assert made[0].calls == [("start", True), ("resume",)]
    # A retried global-setup must not re-arm the jobs twice.
    assert scheduler_mod.release_scheduler(app) == {"released": False, "state": "running"}
    assert reschedules == [app]


def test_release_without_a_scheduler_raises(monkeypatch, app):
    monkeypatch.setattr(scheduler_mod, "_scheduler", None)
    with pytest.raises(RuntimeError):
        scheduler_mod.release_scheduler(app)


def test_release_endpoint_is_404_without_the_debug_flag_and_releases_with_it(app, client, monkeypatch, fake):
    made, reschedules = fake
    app.config["E2E_DEBUG_ENDPOINTS"] = False
    monkeypatch.delenv("E2E_DEBUG_ENDPOINTS", raising=False)
    assert client.post("/api/app/notify/debug/scheduler/release").status_code == 404

    app.config["E2E_DEBUG_ENDPOINTS"] = True
    assert client.post("/api/app/notify/debug/scheduler/release").status_code == 409  # no scheduler

    monkeypatch.setenv("E2E_SCHEDULER_HELD", "1")
    scheduler_mod.init_scheduler(app)
    res = client.post("/api/app/notify/debug/scheduler/release")
    assert res.status_code == 200
    assert res.get_json() == {"released": True, "state": "running"}
    assert made[0].calls == [("start", True), ("resume",)]
