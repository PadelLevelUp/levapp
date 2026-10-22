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
        f"SSE streams: open=3 max_per_user=2 cap=40 "
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
