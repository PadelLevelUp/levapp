"""PAD-264 / audit H12 — the scheduler never starts inside a migration process.

Production runs migrations as `python -m flask --app app.py db upgrade`
(backend/scripts/entrypoint.sh). Under `python -m`, sys.argv[0] is
".../flask/__main__.py", so init_scheduler's guard, which only recognised the
`flask` console script, let APScheduler start inside every deploy's migration:
jobs fired against a half-migrated schema and the startup reschedule (M18)
ran twice. Server processes (gunicorn, `flask run`) must still start it.
"""
import pytest

import padel_app.scheduler as scheduler_mod


class _Started(Exception):
    """Raised by the fake BackgroundScheduler: proof the guard let it start."""


@pytest.fixture
def fake_scheduler(monkeypatch):
    import apscheduler.schedulers.background as bg

    def _refuse(*args, **kwargs):
        raise _Started()

    monkeypatch.setattr(bg, "BackgroundScheduler", _refuse)
    monkeypatch.setattr(scheduler_mod, "_scheduler", None)
    monkeypatch.setattr(scheduler_mod, "_app", None)
    monkeypatch.setenv("TEST_MODE", "true")
    monkeypatch.delenv("WERKZEUG_RUN_MAIN", raising=False)


PY_M_FLASK = "/usr/local/lib/python3.11/site-packages/flask/__main__.py"

SKIPS = [
    [PY_M_FLASK, "--app", "app.py", "db", "upgrade"],  # the production entrypoint
    [PY_M_FLASK, "db", "current"],
    ["flask", "db", "upgrade"],
    ["/usr/local/bin/flask", "--app", "app.py", "db", "upgrade"],
    [PY_M_FLASK, "--app", "app.py", "shell"],
    ["flask", "routes"],
]
STARTS = [
    ["gunicorn", "--bind", "0.0.0.0:80", "app:run_app"],  # production server
    ["flask", "run", "--host", "127.0.0.1", "--port", "5001", "--no-reload"],  # E2E
    [PY_M_FLASK, "--app", "app.py", "run"],
    ["flask", "--app", "app.py", "run"],
]


@pytest.mark.parametrize("argv", SKIPS)
def test_scheduler_does_not_start_in_cli_and_migration_processes(app, monkeypatch, fake_scheduler, argv):
    monkeypatch.setattr(scheduler_mod.sys, "argv", argv)
    scheduler_mod.init_scheduler(app)  # must return before constructing it
    assert scheduler_mod._scheduler is None


@pytest.mark.parametrize("argv", STARTS)
def test_scheduler_starts_in_server_processes(app, monkeypatch, fake_scheduler, argv):
    monkeypatch.setattr(scheduler_mod.sys, "argv", argv)
    with pytest.raises(_Started):
        scheduler_mod.init_scheduler(app)
