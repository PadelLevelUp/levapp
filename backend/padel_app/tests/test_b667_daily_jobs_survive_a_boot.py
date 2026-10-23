"""B-667 — the daily jobs fire whatever the deploy rhythm (``delivery.worker-role`` rule 4).

``extend_schedule_window`` and ``prune_delivery_incidents`` were ``IntervalTrigger(days=1)`` with
``replace_existing=True``: every boot re-registered them at boot + 24 h, so with a deploy a day they
never fired (prod job store, 2026-10-22: both at boot + 24 h to the second). A daily job now runs at a
fixed UTC minute, a re-registration keeps its next run, and a boot whose store shows a missed run
adds one catch-up.
"""
from datetime import datetime, timedelta, timezone

from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.interval import IntervalTrigger

from padel_app import scheduler as sched_mod
from padel_app.tests.test_pad695_worker_role import boot  # noqa: F401 — the real-init_scheduler fixture

DAILY = ("extend_schedule_window", "prune_delivery_incidents", "retention_sweep", "finance_gcp_import")


def _next_runs(sched):
    return {job_id: sched.get_job(job_id).next_run_time for job_id in DAILY}


def test_every_daily_job_runs_at_a_fixed_minute(boot):
    app, sched, _ = boot(ROLE="api", WORKER_SPLIT="off")
    for job_id in DAILY:
        assert isinstance(sched.get_job(job_id).trigger, CronTrigger), job_id
    # The sweep: no recurring job of an hour or more may be an interval, or a boot moves it.
    for job in sched.get_jobs():
        if isinstance(job.trigger, IntervalTrigger):
            assert job.trigger.interval < timedelta(hours=1), job.id


def test_a_second_boot_keeps_the_next_run(boot):
    app, sched, _ = boot(ROLE="api", WORKER_SPLIT="off")
    first = _next_runs(sched)
    sched_mod._shutdown_quietly(sched)
    app, sched, _ = boot(ROLE="api", WORKER_SPLIT="off")
    assert _next_runs(sched) == first


def test_a_boot_after_a_missed_run_adds_one_catch_up(boot):
    app, sched, _ = boot(ROLE="api", WORKER_SPLIT="off")
    sched_mod._shutdown_quietly(sched)
    # The leader was down across extend_schedule_window's minute: its stored next run is past.
    # The store pickles the whole job, next run included, so edit it through the store.
    from apscheduler.jobstores.sqlalchemy import SQLAlchemyJobStore

    store = SQLAlchemyJobStore(url=boot.url)
    store.start(sched, "default")
    job = store.lookup_job("extend_schedule_window")
    job.next_run_time = datetime.now(timezone.utc) - timedelta(hours=2)
    store.update_job(job)
    store.shutdown()
    app, sched, _ = boot(ROLE="api", WORKER_SPLIT="off")
    catch_up = sched.get_job("extend_schedule_window_catchup")
    assert catch_up is not None
    assert catch_up.next_run_time <= datetime.now(timezone.utc) + timedelta(seconds=5)
    assert catch_up.func is sched_mod._run_extend_schedule_window
    # The others were not missed, and the daily job itself is back on its fixed minute.
    assert sched.get_job("prune_delivery_incidents_catchup") is None
    assert sched.get_job("extend_schedule_window").next_run_time > datetime.now(timezone.utc)


def test_a_first_boot_adds_no_catch_up(boot):
    app, sched, _ = boot(ROLE="api", WORKER_SPLIT="off")
    assert not [j.id for j in sched.get_jobs() if j.id.endswith("_catchup")]


def test_the_api_under_the_split_still_registers_no_daily_job(boot):
    app, sched, _ = boot(ROLE="api", WORKER_SPLIT="on")
    assert sched.get_jobs() == []
