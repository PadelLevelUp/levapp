"""PAD-695 — the worker role: the scheduler's jobs run in their own process (``delivery.worker-role``).

Rule 1: ``ROLE`` + ``WORKER_SPLIT`` pick the scheduler mode; the API under the split is a job-store
client (started paused, no recurring jobs, no leadership). Rule 2: the worker waits for the lock
without exiting, wakes its scheduler while it leads, answers ``/livez``, and shuts down in order.
``delivery.zero-downtime-deploy`` rule 13: ``rollout.sh --worker`` (stub docker, R-028 harness of
``test_pad588_rollout``).
"""
import json
import os
import subprocess
import sys
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest
from flask import Flask

from padel_app import scheduler as sched_mod
from padel_app import worker as worker_mod
from padel_app.tests.test_pad588_rollout import DOCKER_STUB, live, run as rollout_run, containers, index
from padel_app.tests.test_pad588_rollout import sb  # noqa: F401 — the stub-docker fixture


# --- rule 1: modes ------------------------------------------------------------------------------

@pytest.mark.parametrize("role,split,mode", [
    ("api", False, "compete"),
    ("api", True, "client"),
    ("events", True, "off"),  # B-677: an events process holds streams, never the scheduler
    ("events", False, "off"),
    ("worker", True, "compete"),
    ("worker", False, "off"),
])
def test_role_and_split_pick_the_scheduler_mode(role, split, mode):
    assert sched_mod.scheduler_mode(role, split) == mode


def test_role_defaults_to_api_and_unknown_roles_are_api():
    assert sched_mod.process_role({}) == "api"
    assert sched_mod.process_role({"ROLE": " Worker "}) == "worker"
    assert sched_mod.process_role({"ROLE": "batch"}) == "api"


def test_the_split_is_off_unless_set_on():
    assert sched_mod.worker_split_enabled({}) is False
    assert sched_mod.worker_split_enabled({"WORKER_SPLIT": "off"}) is False
    assert sched_mod.worker_split_enabled({"WORKER_SPLIT": "on"}) is True
    assert sched_mod.worker_split_enabled({"WORKER_SPLIT": "1"}) is True


@pytest.fixture
def boot(tmp_path, monkeypatch):
    """Runs the real ``init_scheduler`` (not under test_config) against a SQLite job store."""
    started = []
    monkeypatch.setattr(sys, "argv", ["gunicorn"])
    monkeypatch.delenv("TEST_MODE", raising=False)
    monkeypatch.delenv("E2E_SCHEDULER_HELD", raising=False)
    monkeypatch.setattr(sched_mod, "_scheduler", None)
    monkeypatch.setattr(sched_mod, "_app", None)
    monkeypatch.setattr(sched_mod, "_startup_reschedule", lambda app: started.append("reschedule"))
    monkeypatch.setattr(sched_mod, "_start_scheduler_leadership", lambda app, s: started.append("leadership"))
    url = f"sqlite:///{tmp_path / 'jobs.db'}"
    # The scheduler's pool options are Postgres's; SQLite's engine refuses pool_size.
    import apscheduler.jobstores.sqlalchemy as sa_store

    class SqliteJobStore(sa_store.SQLAlchemyJobStore):
        def __init__(self, url=None, engine_options=None, **kw):
            super().__init__(url=url, **kw)

    monkeypatch.setattr(sa_store, "SQLAlchemyJobStore", SqliteJobStore)

    def _boot(**env):
        for k, v in env.items():
            monkeypatch.setenv(k, v)
        app = Flask("boot")
        app.config["SQLALCHEMY_DATABASE_URI"] = url
        sched_mod.init_scheduler(app, test_config=None)
        sched = app.extensions.get("scheduler")
        if sched is not None:
            boot.cleanup.append(sched)
        return app, sched, started

    boot.cleanup = []
    _boot.url = url
    yield _boot
    for s in boot.cleanup:
        sched_mod._shutdown_quietly(s)


def _noop():
    pass


def test_api_under_the_split_is_a_paused_job_store_client(boot):
    from apscheduler.jobstores.sqlalchemy import SQLAlchemyJobStore
    from apscheduler.schedulers.base import STATE_PAUSED

    app, sched, started = boot(ROLE="api", WORKER_SPLIT="on")
    assert sched.state == STATE_PAUSED
    assert sched.running, "ensure_scheduler_ready() checks running: paused passes"
    assert sched.get_jobs() == [], "no recurring jobs: replace_existing would push the worker's forward"
    assert started == [], "no leadership thread, no startup reschedule"
    assert "scheduler_leadership" not in app.extensions

    # A request handler's schedule_* call lands in the shared store, where the worker finds it.
    when = datetime.now(timezone.utc) + timedelta(hours=1)
    sched.add_job(_noop, "date", run_date=when, id="reminder_lesson_1_2026-10-22")
    store = SQLAlchemyJobStore(url=boot.url)
    store.start(sched, "default")
    assert store.lookup_job("reminder_lesson_1_2026-10-22") is not None
    store.shutdown()


def test_without_the_split_the_api_competes_as_before(boot):
    app, sched, started = boot(ROLE="api", WORKER_SPLIT="off")
    assert {j.id for j in sched.get_jobs()} >= {"process_batches", "extend_schedule_window"}
    assert started == ["leadership"]


def test_a_worker_competes_under_the_split(boot):
    app, sched, started = boot(ROLE="worker", WORKER_SPLIT="on")
    assert {j.id for j in sched.get_jobs()} >= {"process_batches", "retention_sweep"}
    assert started == ["leadership"]


def test_a_worker_without_the_split_starts_no_scheduler(boot):
    app, sched, started = boot(ROLE="worker", WORKER_SPLIT="off")
    assert sched is None and started == []


def test_the_exit_hook_skips_a_scheduler_already_shut_down(boot):
    app, sched, _ = boot(ROLE="api", WORKER_SPLIT="on")
    sched.shutdown(wait=False)
    sched_mod._shutdown_quietly(sched)  # the worker shut it down first: no SchedulerNotRunningError


# --- rule 2: the worker loop --------------------------------------------------------------------

class FakeScheduler:
    def __init__(self, calls):
        self.calls = calls
        self.running = True

    def wakeup(self):
        self.calls.append("wakeup")

    def shutdown(self, wait=True):
        self.calls.append(f"shutdown(wait={wait})")
        self.running = False

    def get_jobs(self):
        return [1, 2]


class FakeLeadership:
    def __init__(self, calls, leader=False):
        self.calls = calls
        self.is_leader = leader

    def stop(self):
        self.calls.append("leadership.stop")


class Clock:
    def __init__(self):
        self.t = 0.0

    def __call__(self):
        return self.t


def make_worker(calls, *, leader, split=True, clock=None):
    return worker_mod.Worker(
        scheduler=FakeScheduler(calls), leadership=FakeLeadership(calls, leader), split=split,
        drain=lambda: calls.append("drain"), clock=clock or Clock(),
        status_line=lambda w: f"worker: leader={w.is_leader}",
    )


def test_the_leader_wakes_its_scheduler_every_tick():
    calls = []
    w = make_worker(calls, leader=True)
    w.tick(); w.tick()
    assert calls == ["wakeup", "wakeup"]


def test_a_standby_waits_with_a_warning_every_minute_and_never_exits(capsys):
    calls, clock = [], Clock()
    w = make_worker(calls, leader=False, clock=clock)
    for t in (5, 30, 59):
        clock.t = t; w.tick()
    assert "WARNING not the scheduler leader" not in capsys.readouterr().out
    clock.t = 61; w.tick()
    assert "WARNING not the scheduler leader after 61s" in capsys.readouterr().out
    clock.t = 100; w.tick()
    assert "WARNING" not in capsys.readouterr().out.replace("worker: leader", "")
    assert "wakeup" not in calls, "a standby never wakes a paused scheduler"


def test_livez_reports_the_leader_and_the_split():
    assert make_worker([], leader=True).livez() == {"status": "alive", "leader": True, "split": "on"}
    assert make_worker([], leader=False).livez()["leader"] is False
    idle = worker_mod.Worker(scheduler=None, leadership=None, split=False)
    assert idle.livez() == {"status": "alive", "leader": False, "split": "off"}


def test_sigterm_finishes_jobs_then_drains_then_gives_up_the_lock():
    calls = []
    w = make_worker(calls, leader=True)
    w.request_stop()
    w.run()  # returns at once: the stop is set
    w.shutdown()
    assert calls == ["shutdown(wait=True)", "drain", "leadership.stop"]


def test_livez_is_served_over_http():
    w = make_worker([], leader=True)
    server = worker_mod.serve_livez(w, 0)
    try:
        port = server.server_address[1]
        body = json.load(urllib.request.urlopen(f"http://127.0.0.1:{port}/livez", timeout=3))
        assert body == {"status": "alive", "leader": True, "split": "on"}
    finally:
        server.shutdown()


def test_a_non_worker_role_refuses_the_worker_loop(monkeypatch):
    monkeypatch.setenv("FLASK_ENV", "production")
    assert worker_mod.main({"ROLE": "api", "FLASK_ENV": "production"}) == 2


# --- zero-downtime-deploy rule 13: rollout.sh --worker ------------------------------------------

# `docker exec <c> python -c …livez…`: a worker container answers "leader" once no other worker
# container exists (the old one stopped and released the lock), "standby" before that; a file
# <c>.dead makes it not answer, STUB_WORKER_LEADS=0 keeps it a standby.
EXEC_CASE = r"""  exec)
    n="$2"; [ -e "$C/$n" ] || exit 1; [ -e "$C/$n.dead" ] && exit 1
    [ -n "${STUB_WORKER_DEAD:-}" ] && case "$n" in *_next) exit 1 ;; esac
    others=$(ls "$C" | grep -E '_worker(_next)?$' | grep -vx "$n" | head -1)
    if [ -z "$others" ] && [ "${STUB_WORKER_LEADS:-1}" = 1 ]; then echo leader; else echo standby; fi ;;
  logs)"""


@pytest.fixture
def wsb(sb, monkeypatch):  # noqa: F811
    docker = sb["home"].parent / "bin" / "docker"
    docker.write_text(DOCKER_STUB.replace("  logs)", EXEC_CASE, 1))
    sb["env"]["WORKER_HEALTH_TIMEOUT"] = "3"
    sb["env"]["WORKER_LEAD_TIMEOUT"] = "3"
    return sb


def test_worker_swap_starts_the_new_worker_then_stops_the_old_and_checks_it_leads(wsb):
    live(wsb, "padelapp", 5000)
    (wsb["home"] / "containers" / "padelapp_worker").write_text("\n")
    r, calls = rollout_run(wsb, "--worker")
    assert r.returncode == 0, r.stdout + r.stderr
    api_done = index(calls, "docker rename padelapp_next padelapp")
    started = index(calls, "docker run -d --name padelapp_worker_next")
    stopped = index(calls, "docker stop -t 60 padelapp_worker")
    assert api_done < started < stopped, "the worker swaps after the API, start before stop"
    run_call = calls[started]
    assert "--memory 256m -e ROLE=worker" in run_call
    assert run_call.endswith("repo/levelup_backend:abc123 python -m padel_app.worker")
    assert " -p " not in run_call
    assert "worker: padelapp_worker leads the scheduler" in r.stdout
    assert set(containers(wsb)) == {"padelapp", "padelapp_worker"}


def test_an_unanswering_new_worker_is_removed_and_the_old_keeps_leading(wsb):
    live(wsb, "padelapp", 5000)
    (wsb["home"] / "containers" / "padelapp_worker").write_text("\n")
    r, calls = rollout_run(wsb, "--worker", STUB_WORKER_DEAD="1")
    assert r.returncode == 1
    assert "padelapp_worker keeps leading" in r.stdout
    assert not any(c.startswith("docker stop -t 60 padelapp_worker") for c in calls)
    assert "padelapp_worker" in containers(wsb) and "padelapp_worker_next" not in containers(wsb)


def test_a_new_worker_that_never_leads_turns_the_run_red_but_stays_up(wsb):
    live(wsb, "padelapp", 5000)
    r, _ = rollout_run(wsb, "--worker", STUB_WORKER_LEADS="0")
    assert r.returncode == 1
    assert "is not the scheduler leader" in r.stdout
    assert "padelapp_worker" in containers(wsb), "left running: it may still take over"


def test_without_worker_a_leftover_worker_is_removed(wsb):
    live(wsb, "padelapp", 5000)
    (wsb["home"] / "containers" / "padelapp_worker").write_text("\n")
    r, calls = rollout_run(wsb)
    assert r.returncode == 0, r.stdout + r.stderr
    assert "docker stop -t 60 padelapp_worker" in calls
    assert set(containers(wsb)) == {"padelapp"}


def test_the_worker_swap_also_follows_a_stop_first_deploy(wsb):
    live(wsb, "padelapp", 5000)
    r, calls = rollout_run(wsb, "--stop-first", "--worker")
    assert r.returncode == 0, r.stdout + r.stderr
    assert index(calls, "docker run -d --name padelapp -p") < index(calls, "docker run -d --name padelapp_worker_next")


def test_dry_run_prints_the_worker_steps(wsb):
    live(wsb, "padelapp", 5000)
    r, _ = rollout_run(wsb, "--worker", "--dry-run")
    assert r.returncode == 0, r.stdout + r.stderr
    assert "worker yes" in r.stdout
    assert "dry-run: docker run -d --name padelapp_worker_next" in r.stderr
    assert "dry-run: docker rename padelapp_worker_next padelapp_worker" in r.stderr


def test_the_split_is_on_for_staging_and_off_for_prod():
    from pathlib import Path

    backend = Path(__file__).resolve().parents[2]
    assert "\nWORKER_SPLIT=on\n" in (backend / ".env.staging").read_text()
    assert "\nWORKER_SPLIT=off\n" in (backend / ".env.prod").read_text()
    assert "\nSSE_BROKER=postgres\n" in (backend / ".env.staging").read_text(), "rule 3: the split needs it"
    for template in (".env.staging", ".env.prod"):
        assert "\nROLE=" not in (backend / template).read_text(), "ROLE comes from -e, never the env file"


# --- a deploy without --worker leaves no worker behind (rollback question, 2026-10-22) -----------

WORKFLOWS = Path(__file__).resolve().parents[3] / ".github" / "workflows"


def leftover_block(workflow):
    lines = (WORKFLOWS / workflow).read_text().splitlines()
    start = next(i for i, l in enumerate(lines) if "PAD-695: no worker outlives" in l)
    end = start
    while lines[end].strip() != "fi" or lines[end].startswith("            "):
        end += 1
    return "\n".join(l.strip() for l in lines[start:end + 1])


@pytest.mark.parametrize("workflow,name", [("deploy-prod.yaml", "padelapp"), ("deploy-staging.yaml", "padelapp_staging")])
@pytest.mark.parametrize("worker_opt,script_knows_worker,removed", [
    ("", True, True),             # WORKER_SPLIT off
    ("--worker", False, True),    # a rollback: the checked-out rollout.sh predates the worker role
    ("--worker", True, False),    # the worker was just swapped by rollout.sh: leave it
])
def test_a_deploy_without_a_worker_removes_a_leftover_one(tmp_path, workflow, name, worker_opt, script_knows_worker, removed):
    home = tmp_path / "home"
    home.mkdir()
    (home / "rollout.sh").write_text("case x in\n    --worker) ;;\nesac\n" if script_knows_worker else "case x in\n    --migrate) ;;\nesac\n")
    bin_dir = tmp_path / "bin"
    bin_dir.mkdir()
    docker = bin_dir / "docker"
    docker.write_text('#!/usr/bin/env bash\necho "docker $*" >> "$STUB/calls.log"\nexit 0\n')
    docker.chmod(0o755)
    block = leftover_block(workflow).replace("/home/${{ secrets.GCE_USER }}", str(home))
    r = subprocess.run(["bash", "-c", f'WORKER_OPT="{worker_opt}"\n{block}'], capture_output=True, text=True, timeout=30,
                       env={"PATH": f"{bin_dir}:{os.environ['PATH']}", "STUB": str(tmp_path)})
    assert r.returncode == 0, r.stderr
    calls = (tmp_path / "calls.log").read_text() if (tmp_path / "calls.log").exists() else ""
    assert (f"docker stop -t 60 {name}_worker" in calls) is removed
    assert (f"docker rm {name}_worker" in calls) is removed
