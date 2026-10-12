"""PAD-588 (delivery.zero-downtime-deploy rules 1-3): one scheduler leader across processes.

During a rolling deploy two API containers serve for a few seconds. Both share the Postgres job
store, so both running APScheduler would fire every due reminder twice. Leadership is a Postgres
session advisory lock held on a dedicated connection: the holder runs the scheduler, the other
process keeps it paused and retries. These tests drive `SchedulerLeadership.step()` with a fake
connection, so they need no database and no threads.
"""
import pytest

from padel_app.scheduler_leadership import SchedulerLeadership


class FakeConn:
    def __init__(self, world):
        self.world = world
        self.closed = False

    def try_lock(self, key):
        if self.world.get("fail_query"):
            raise ConnectionError("server closed the connection unexpectedly")
        if self.world.get("held_by_other"):
            return False
        self.world["holder"] = self
        return True

    def ping(self):
        if self.world.get("fail_query") or self.closed:
            raise ConnectionError("server closed the connection unexpectedly")

    def close(self):
        self.closed = True
        if self.world.get("holder") is self:
            self.world["holder"] = None


@pytest.fixture
def world():
    return {"events": [], "connects": 0}


def make(world):
    def connect():
        if world.get("fail_connect"):
            raise ConnectionError("could not connect to server")
        world["connects"] += 1
        return FakeConn(world)

    return SchedulerLeadership(
        connect,
        on_acquire=lambda: world["events"].append("acquire"),
        on_lose=lambda: world["events"].append("lose"),
        interval=0.01,
    )


def test_the_free_lock_is_taken_and_the_scheduler_resumed_once(world):
    lead = make(world)
    lead.step()
    lead.step()
    lead.step()
    assert lead.is_leader
    assert world["events"] == ["acquire"], "a held lock is pinged, never re-acquired"


def test_a_lock_held_by_the_other_container_keeps_this_one_paused(world):
    world["held_by_other"] = True
    lead = make(world)
    lead.step()
    lead.step()
    assert not lead.is_leader
    assert world["events"] == []


def test_the_waiting_container_takes_over_when_the_old_one_stops(world):
    world["held_by_other"] = True
    lead = make(world)
    lead.step()
    world["held_by_other"] = False  # the old container stopped; its session (and lock) ended
    lead.step()
    assert lead.is_leader
    assert world["events"] == ["acquire"]


def test_a_postgres_restart_pauses_then_reacquires(world):
    lead = make(world)
    lead.step()
    world["fail_query"] = True  # Postgres restarted: the session, and with it the lock, is gone
    lead.step()
    assert not lead.is_leader
    assert world["events"] == ["acquire", "lose"]
    world["fail_query"] = False
    lead.step()
    assert lead.is_leader
    assert world["events"] == ["acquire", "lose", "acquire"]
    assert world["connects"] == 2, "a lost session is replaced by a new connection"


def test_an_unreachable_database_is_retried_without_raising(world):
    world["fail_connect"] = True
    lead = make(world)
    lead.step()
    lead.step()
    assert not lead.is_leader and world["events"] == []
    world["fail_connect"] = False
    lead.step()
    assert lead.is_leader


def test_a_failing_acquire_callback_releases_the_lock_for_the_next_try(world):
    calls = {"n": 0}

    def flaky_acquire():
        calls["n"] += 1
        if calls["n"] == 1:
            raise RuntimeError("reschedule blew up")

    lead = SchedulerLeadership(lambda: FakeConn(world), on_acquire=flaky_acquire, on_lose=lambda: None, interval=0.01)
    lead.step()
    assert not lead.is_leader
    assert world.get("holder") is None, "the lock is given back, so this or the other process can retry"
    lead.step()
    assert lead.is_leader and calls["n"] == 2


@pytest.mark.skipif(
    __import__("os").getenv("LEVAPP_TEST_DB", "sqlite").strip().lower() != "postgres",
    reason="session advisory locks are a Postgres feature",
)
def test_on_postgres_one_session_leads_and_the_next_takes_over_when_it_ends(app):
    """The real lock: a second process cannot lead while the first session lives, and leads once
    that session ends (the old container stopping), with no explicit unlock."""
    from padel_app.scheduler_leadership import pg_lock_connector

    connect = pg_lock_connector(app.config["SQLALCHEMY_DATABASE_URI"])
    events = []
    old = SchedulerLeadership(connect, lambda: events.append("old"), lambda: None, interval=0.01, lock_key=0x50AD588)
    new = SchedulerLeadership(connect, lambda: events.append("new"), lambda: None, interval=0.01, lock_key=0x50AD588)

    old.step()
    new.step()
    assert old.is_leader and not new.is_leader

    old.stop()  # the old container's session ends
    new.step()
    assert new.is_leader
    assert events == ["old", "new"]
    new.stop()


def test_outside_test_mode_the_scheduler_starts_paused_and_leadership_resumes_it(app, monkeypatch):
    """Wiring (rule 1): production boot starts the scheduler paused and does NOT reschedule on the
    boot path; the leadership thread's acquire runs the reschedule, then resumes."""
    import apscheduler.jobstores.sqlalchemy as sajs
    import apscheduler.schedulers.background as bg

    import padel_app.scheduler as scheduler_mod
    import padel_app.scheduler_leadership as leadership_mod
    from padel_app.tests.test_pad610_scheduler_held_under_e2e import _FakeScheduler as _Base

    class _FakeScheduler(_Base):
        def pause(self):
            self.calls.append(("pause",))

    made, reschedules, threads = [], [], []
    monkeypatch.setattr(bg, "BackgroundScheduler", lambda *a, **k: made.append(_FakeScheduler()) or made[-1])
    monkeypatch.setattr(sajs, "SQLAlchemyJobStore", lambda *a, **k: object())
    monkeypatch.setattr(scheduler_mod, "_scheduler", None)
    monkeypatch.setattr(scheduler_mod, "_app", None)
    monkeypatch.setattr(scheduler_mod.sys, "argv", ["gunicorn", "app:app"])
    monkeypatch.delenv("TEST_MODE", raising=False)
    monkeypatch.delenv("E2E_SCHEDULER_HELD", raising=False)
    monkeypatch.delenv("SCHEDULER_LEADERSHIP", raising=False)
    monkeypatch.delenv("WERKZEUG_RUN_MAIN", raising=False)
    monkeypatch.setattr(scheduler_mod.atexit, "register", lambda *_: None)
    monkeypatch.setattr(scheduler_mod, "_startup_reschedule", lambda _app: reschedules.append(1))
    monkeypatch.setattr(leadership_mod, "pg_lock_connector", lambda url: (lambda: None))
    monkeypatch.setattr(leadership_mod.SchedulerLeadership, "start_thread", lambda self: threads.append(self))

    scheduler_mod.init_scheduler(app)

    (sched,) = made
    assert sched.calls == [("start", True)], "paused at boot"
    assert reschedules == [], "no reschedule on gunicorn's boot path"
    (lead,) = threads
    lead._on_acquire()
    assert reschedules == [1] and sched.calls[-1] == ("resume",)
    lead._on_lose()
    assert sched.calls[-1] == ("pause",)
