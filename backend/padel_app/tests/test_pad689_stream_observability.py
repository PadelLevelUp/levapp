"""PAD-689 — the stream cap is observable (`messaging.sse-realtime` rule 25).

Before PAD-689 a refused stream and a dropped push were single WARNING lines nobody watched, and
nothing said how close the server was to its cap. Now every stream-holding process logs one line a
minute with the open streams, the busiest user, the cap and the push queue, in both broker modes;
the two WARNING texts an alert keys on are frozen; and gunicorn's thread count comes from
`GUNICORN_THREADS` so the cap and the threads can be raised together by an env change.
"""
import logging
import pathlib
import re
import time

import pytest

from padel_app import realtime

BACKEND = pathlib.Path(__file__).resolve().parents[2]


@pytest.fixture(autouse=True)
def _clean_realtime():
    realtime._subscribers.clear()
    realtime._refused = 0
    yield
    realtime.shutdown()
    realtime._subscribers.clear()


def test_the_stats_line_names_streams_busiest_user_cap_and_push_queue(app_with_config):
    from padel_app.utils import push_sender

    app_with_config({"SSE_MAX_STREAMS": 40})
    for user_id in (1, 1, 2):
        realtime.subscribe(user_id)
    dropped = push_sender.stats()["dropped"]
    assert realtime.stats_line() == (
        f"SSE streams: open=3 max_per_user=2 cap=40 refused=0 "
        f"push_queue=0/{push_sender.QUEUE_MAX} pushes_dropped={dropped}"
    )


def test_the_stats_line_is_logged_every_interval_in_memory_mode(app_with_config, monkeypatch, caplog):
    app_with_config({"SSE_BROKER": "memory", "SSE_MAX_STREAMS": 40})
    monkeypatch.setattr(realtime, "MONITOR_SECONDS", 0.2)
    with caplog.at_level(logging.INFO, logger="padel_app.realtime"):
        realtime.subscribe(7)
        deadline = time.monotonic() + 3
        while time.monotonic() < deadline:
            lines = [r.getMessage() for r in caplog.records if r.getMessage().startswith("SSE streams: ")]
            if len(lines) >= 2:
                break
            time.sleep(0.05)
    assert len(lines) >= 2, "no per-interval stats line"
    assert lines[0].startswith("SSE streams: open=1 max_per_user=1 cap=40 ")


def test_only_one_monitor_runs_per_process(app_with_config, monkeypatch):
    app_with_config({})
    monkeypatch.setattr(realtime, "MONITOR_SECONDS", 0.2)
    realtime.subscribe(1)
    realtime.subscribe(2)
    import threading

    assert sum(t.name == "realtime-monitor" and t.is_alive() for t in threading.enumerate()) == 1


# --- frozen alert strings -------------------------------------------------------------------------

@pytest.mark.parametrize("path,text", [
    ("padel_app/modules/frontend_api.py", '"SSE stream refused: scope=%s user=%s open_streams=%s"'),
    ("padel_app/utils/push_sender.py", '"push sender: queue full (%d), dropping oldest: %s"'),
    ("padel_app/utils/push_sender.py", '"push sender: provider unresponsive, dropping %s until the pause ends"'),
    # PUSH_QUEUE=outbox (staging): the outbox backing up is its drop-equivalent signal.
    ("padel_app/utils/push_outbox.py", '"push outbox depth %d over %d (oldest due %ds ago)"'),
])
def test_the_alert_strings_are_frozen(path, text):
    """The Cloud Logging alert (docs/infra) matches these texts; rewording one silences it."""
    assert text in (BACKEND / path).read_text()


# --- gunicorn threads from the environment --------------------------------------------------------

def test_gunicorn_threads_come_from_the_environment_with_64_by_default():
    # PAD-697: the image's CMD runs scripts/serve.sh, which owns the gunicorn command line.
    cmd = [l for l in (BACKEND / "Dockerfile").read_text().splitlines() if l.startswith("CMD ")][-1]
    assert "scripts/serve.sh" in cmd
    serve = (BACKEND / "scripts" / "serve.sh").read_text()
    api_line = [l for l in serve.splitlines() if l.startswith("exec gunicorn") and "--threads" in l][-1]
    assert "${GUNICORN_THREADS:-64}" in api_line
    assert re.search(r"--workers[ \"',]+1\b", api_line), "R-027: one gunicorn worker"
    assert "exec gunicorn" in api_line, "gunicorn must be PID 1's exec target so it gets SIGTERM"


# --- B-676: visible under the process's own logging, not caplog's ----------------------------------

def _fresh_app():
    import tempfile

    from padel_app import create_app

    return create_app({
        "TESTING": True,
        "SQLALCHEMY_TRACK_MODIFICATIONS": False,
        "SQLALCHEMY_DATABASE_URI": "sqlite:///" + tempfile.mktemp(),
    })


@pytest.fixture
def default_logging():
    """Put the realtime logger back to NOTSET (the deployed starting point), and restore the root
    level afterwards: no caplog here, because caplog.at_level sets the very level under test."""
    logger = logging.getLogger("padel_app.realtime")
    package = logging.getLogger("padel_app")
    root = logging.getLogger()
    saved = (logger.level, logger.disabled, package.level, root.level, list(root.handlers))
    logger.setLevel(logging.NOTSET)
    logger.disabled = False
    package.setLevel(logging.NOTSET)
    root.setLevel(logging.WARNING)
    yield logger
    logger.setLevel(saved[0])
    logger.disabled = saved[1]
    package.setLevel(saved[2])
    root.setLevel(saved[3])
    root.handlers[:] = saved[4]  # Alembic's fileConfig swaps in its own console handler


def test_the_realtime_info_lines_are_enabled_under_default_logging(default_logging):
    _fresh_app()
    assert default_logging.isEnabledFor(logging.INFO), (
        "padel_app.realtime's INFO is dropped at the root WARNING level: the stats line and "
        "'LISTEN ready' never reach the container logs (B-676)"
    )


def test_the_realtime_info_lines_survive_alembics_file_config(default_logging):
    from logging.config import fileConfig

    _fresh_app()
    fileConfig(str(BACKEND / "migrations" / "alembic.ini"), disable_existing_loggers=False)
    assert default_logging.isEnabledFor(logging.INFO)
    assert not default_logging.disabled


def test_the_package_logger_is_info_so_app_logger_lines_are_read(default_logging):
    """`app.logger` IS the `padel_app` logger: "Scheduler leadership acquired", the reschedule
    counts, the migrate lines were all dropped at the root WARNING level too (B-676, widened)."""
    app = _fresh_app()
    assert app.logger is logging.getLogger("padel_app")
    assert app.logger.isEnabledFor(logging.INFO)


def test_a_sibling_module_needs_no_level_of_its_own(default_logging):
    _fresh_app()
    assert logging.getLogger("padel_app.scheduler").isEnabledFor(logging.INFO)
    assert not logging.getLogger().isEnabledFor(logging.INFO), "root stays at WARNING"


# --- refusals and drops are counted and recorded (rule 25a) ---------------------------------------

def test_a_refused_stream_logs_the_frozen_warning_and_counts_in_the_stats_line(app, client, caplog):
    """The alert keys on the emitted line, not on the source text: drive a real refusal."""
    from flask_jwt_extended import create_access_token

    app.config.update(JWT_SECRET_KEY="test-jwt-secret", JWT_QUERY_STRING_NAME="token",
                      SSE_MAX_STREAMS=1, SSE_MAX_STREAMS_PER_USER=4)
    with app.app_context():
        first, second = (create_access_token(identity=str(u)) for u in (901, 902))
    held = client.get(f"/api/app/events?token={first}")
    try:
        with caplog.at_level(logging.WARNING):
            refused = client.get(f"/api/app/events?token={second}")
        assert refused.status_code == 503
        lines = [r.getMessage() for r in caplog.records if r.levelno == logging.WARNING]
        assert "SSE stream refused: scope=total user=902 open_streams=1" in lines
        assert " refused=1 " in realtime.stats_line()
    finally:
        held.close()


def _incidents(app):
    from padel_app.models.delivery_incident import DeliveryIncident

    with app.app_context():
        return [(i.kind, i.channel, i.detail) for i in DeliveryIncident.query.order_by(DeliveryIncident.id)]


def test_a_window_with_refusals_and_drops_writes_one_row_per_kind(app_with_config, monkeypatch):
    from padel_app.utils import push_sender

    app = app_with_config({"SSE_MAX_STREAMS": 40})
    seen = realtime._counters()
    realtime._refused += 37
    monkeypatch.setitem(push_sender._stats, "dropped", push_sender._stats["dropped"] + 5)

    seen = realtime.record_window(seen)
    assert _incidents(app) == [
        ("stream_refused", "sse", "37 live-update stream(s) refused at the cap (40) in 60 s"),
        ("push_dropped", "push", "5 push(es) dropped by the in-process sender in 60 s"),
    ]

    realtime.record_window(seen)  # a quiet window writes nothing
    assert len(_incidents(app)) == 2


def test_a_quiet_process_writes_no_incident(app_with_config):
    app = app_with_config({})
    realtime.record_window(realtime._counters())
    assert _incidents(app) == []


def test_the_engine_health_page_counts_the_new_kinds(app_with_config):
    from padel_app.models.delivery_incident import KINDS

    assert {"stream_refused", "push_dropped"} <= set(KINDS)
