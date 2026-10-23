"""PAD-697 — the events role: `/api/app/events` served by its own process (`ROLE=events`).

`delivery.events-role` (new) and `messaging.sse-realtime`. The API keeps its threads; the events
process serves only the stream route plus its probes, needs the Postgres broker to receive anything
(R1), answers ready only while its listener is LISTENing, and its worker class and stream cap come
from one place (the serve script, the role-aware defaults). `EVENTS_SPLIT` makes the API answer a
loud 410 on the moved path.
"""
import os
import pathlib
import subprocess
import sys

import pytest

from padel_app import realtime
from padel_app.tests.git_env import git_env

BACKEND = pathlib.Path(__file__).resolve().parents[2]
SERVE = BACKEND / "scripts" / "serve.sh"


@pytest.fixture(autouse=True)
def _clean_realtime():
    realtime._subscribers.clear()
    yield
    realtime.shutdown()
    realtime._subscribers.clear()


@pytest.fixture
def events_app(app_with_config, monkeypatch):
    monkeypatch.setenv("ROLE", "events")
    return app_with_config({"SSE_BROKER": "memory"})


# --- the role guard -------------------------------------------------------------------------------

def test_the_events_role_serves_only_the_stream_and_its_probes(events_app):
    client = events_app.test_client()
    res = client.get("/api/app/messages/unread_count")
    assert res.status_code == 404 and res.get_json() == {"error": "NOT_ON_EVENTS"}
    assert client.get("/api/app/livez").status_code == 200
    # The stream route is not refused by the guard (no token here, so the JWT layer answers).
    assert client.get("/api/app/events").status_code == 401


def test_the_api_answers_410_on_the_moved_path_only_when_split(app_with_config, monkeypatch):
    monkeypatch.setenv("ROLE", "api")
    monkeypatch.setenv("EVENTS_SPLIT", "on")
    client = app_with_config({}).test_client()
    res = client.get("/api/app/events")
    assert res.status_code == 410 and res.get_json() == {"error": "EVENTS_MOVED"}
    assert client.get("/api/app/livez").status_code == 200


def test_without_the_split_the_api_still_serves_the_stream(app_with_config, monkeypatch):
    monkeypatch.setenv("ROLE", "api")
    monkeypatch.delenv("EVENTS_SPLIT", raising=False)
    assert app_with_config({}).test_client().get("/api/app/events").status_code == 401


# --- readiness (R1) -------------------------------------------------------------------------------

def test_the_events_role_is_never_ready_on_the_memory_broker(events_app, caplog):
    import logging

    res = events_app.test_client().get("/api/app/healthz")
    assert res.status_code == 503 and res.get_json()["status"] == "events_needs_postgres_broker"
    # liveness never depends on the broker or the listener
    assert events_app.test_client().get("/api/app/livez").status_code == 200


def test_the_events_role_logs_an_error_on_the_memory_broker(app_with_config, monkeypatch, caplog):
    import logging

    monkeypatch.setenv("ROLE", "events")
    with caplog.at_level(logging.ERROR, logger="padel_app"):
        app_with_config({"SSE_BROKER": "memory"})
    assert any("ROLE=events needs SSE_BROKER=postgres" in r.getMessage() for r in caplog.records)


@pytest.mark.parametrize("listening,code,status", [(False, 503, "listener_down"), (True, 200, "ok")])
def test_events_readiness_follows_the_listener(events_app, monkeypatch, listening, code, status):
    monkeypatch.setattr(realtime, "broker_status", lambda: {"broker": "postgres", "listening": listening, "since": None})
    res = events_app.test_client().get("/api/app/healthz")
    assert res.status_code == code and res.get_json()["status"] == status


def test_api_readiness_never_depends_on_the_listener(app_with_config, monkeypatch):
    monkeypatch.setenv("ROLE", "api")
    app = app_with_config({})
    monkeypatch.setattr(realtime, "broker_status", lambda: {"broker": "postgres", "listening": False, "since": None})
    assert app.test_client().get("/api/app/healthz").status_code == 200


# --- role-aware stream cap (R6) -------------------------------------------------------------------

def test_the_stream_cap_default_is_role_aware():
    from padel_app.config import sse_stream_limits

    assert sse_stream_limits({"ROLE": "events"}) == (1000, 4)
    assert sse_stream_limits({"ROLE": "api"}) == (40, 4)
    assert sse_stream_limits({}) == (40, 4)
    assert sse_stream_limits({"ROLE": "events", "SSE_MAX_STREAMS": "300"}) == (300, 4)


# --- one serve script (R4, R5) --------------------------------------------------------------------

def _serve(env, tmp_path):
    fake = tmp_path / "gunicorn"
    fake.write_text('#!/bin/sh\necho "$@"\n')
    fake.chmod(0o755)
    run_env = {"PATH": f"{tmp_path}:/usr/bin:/bin", **env}
    return subprocess.run(["sh", str(SERVE)], env=run_env, capture_output=True, text=True, check=True).stdout


def test_the_image_runs_the_serve_script():
    cmd = [l for l in (BACKEND / "Dockerfile").read_text().splitlines() if l.startswith("CMD ")][-1]
    assert "scripts/serve.sh" in cmd


def test_the_api_role_runs_threads(tmp_path):
    out = _serve({}, tmp_path)
    assert "--workers 1" in out and "--threads 64" in out and "gevent" not in out
    assert "--threads 160" in _serve({"GUNICORN_THREADS": "160"}, tmp_path)


def test_the_events_role_runs_gevent_and_can_fall_back_to_threads(tmp_path):
    out = _serve({"ROLE": "events"}, tmp_path)
    assert "--worker-class gevent" in out and "--workers 1" in out
    assert "--config /app/gunicorn_events.conf.py" in out
    assert "python:padel_app" not in out, "a package config imports the app before gevent patches"
    fallback = _serve({"ROLE": "events", "EVENTS_WORKER_CLASS": "gthread"}, tmp_path)
    assert "gevent" not in fallback and "--threads" in fallback


def test_no_preload_and_no_query_string_in_any_access_log(tmp_path):
    text = "\n".join(
        line for f in (SERVE, BACKEND / "Dockerfile")
        for line in f.read_text().splitlines() if not line.lstrip().startswith("#")
    )
    assert "--preload" not in text, "preload loads the app before gevent patches and psycogreen runs"
    for fmt in ("%(r)s", "%(q)s"):
        assert fmt not in text, "the stream's token rides in the query string (PAD-435)"


def test_the_api_role_never_imports_gevent():
    code = (
        "import sys, tempfile; from padel_app import create_app; "
        "create_app({'TESTING': True, 'SQLALCHEMY_TRACK_MODIFICATIONS': False, "
        "'SQLALCHEMY_DATABASE_URI': 'sqlite:///' + tempfile.mktemp()}); "
        "print(any(m == 'gevent' or m.startswith('gevent.') for m in sys.modules))"
    )
    env = {**os.environ, "PYTHONPATH": str(BACKEND), "ROLE": "api"}
    out = subprocess.run([sys.executable, "-c", code], env=env, capture_output=True, text=True, cwd=BACKEND)
    assert out.stdout.strip().splitlines()[-1] == "False", out.stderr[-500:]


def test_the_gevent_config_patches_psycopg_after_fork_and_imports_nothing(monkeypatch):
    import importlib.util

    import psycogreen.gevent

    spec = importlib.util.spec_from_file_location("gunicorn_events_conf", BACKEND / "gunicorn_events.conf.py")
    before = set(sys.modules)
    gunicorn_events = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(gunicorn_events)
    assert not [m for m in set(sys.modules) - before if m.startswith(("padel_app", "ssl", "urllib3", "jwt", "flask"))]

    calls = []
    monkeypatch.setattr(psycogreen.gevent, "patch_psycopg", lambda: calls.append(1))
    gunicorn_events.post_fork(None, None)
    assert calls == [1]


# --- deploy shape (R2, R3) ------------------------------------------------------------------------

REPO = BACKEND.parent


def _events_block():
    wf = (REPO / ".github" / "workflows" / "deploy-staging.yaml").read_text()
    start = wf.index("grep -qiE '^EVENTS_ROLE=")
    return wf[start:wf.index("docker image prune", start)]


def test_the_staging_deploy_rolls_the_events_container_on_its_own_pair_and_upstream():
    block = _events_block()
    assert "--name padelapp_staging_events --ports 5104,5106 --upstream levapp_events_staging" in block
    assert "NGINX_UPSTREAM_CONF=/etc/nginx/conf.d/levapp-events-upstream.conf" in block
    assert "-e ROLE=events" in block
    for absent in ("--migrate", "--worker", "--probe-host", "HUBSPOT", "LINEAR_API_KEY", "WORK_GITHUB_TOKEN"):
        assert absent not in block.split("elif")[0], absent


def test_no_events_container_outlives_the_flag():
    block = _events_block()
    assert "docker rm padelapp_staging_events" in block.split("elif")[1]


def test_the_events_upstream_has_two_loopback_ports_with_a_fail_timeout():
    conf = (REPO / "infra" / "nginx" / "conf.d" / "levapp-events-upstream.conf").read_text()
    assert "upstream levapp_events_staging {" in conf
    for port in (5104, 5106):
        assert f"server 127.0.0.1:{port} max_fails=1 fail_timeout=5s;" in conf


@pytest.mark.parametrize("vhost", ["levapp-staging", "levapp-api-staging"])
def test_both_staging_hosts_route_the_stream_to_the_events_upstream(vhost):
    text = (REPO / "infra" / "nginx" / "sites-available" / vhost).read_text()
    loc = text[text.index("location /api/app/events {"):]
    loc = loc[:loc.index("}")]
    assert "proxy_pass http://levapp_events_staging;" in loc
    assert "error_log /var/log/nginx/error.log crit;" in loc  # B-182: no token at level error
    assert "proxy_buffering off;" in loc


def test_the_leftover_removal_never_strands_a_routed_stream():
    """F (2026-10-22): with the host still routing /api/app/events to the events upstream, removing
    the container would 502 every stream. Remove only when no enabled vhost proxies there (rollout.sh
    rule 6's detector; a glob over sites-enabled, B-662), else keep it and warn."""
    branch = _events_block().split("elif")[1]
    assert 'proxy_pass[[:space:]]+http://levapp_events_staging[;/]' in branch
    assert "/etc/nginx/sites-enabled/*" in branch and "grep -r" not in branch
    assert "::warning::" in branch
    keep, remove = branch.index("::warning::"), branch.index("docker rm padelapp_staging_events")
    assert keep < remove, "the warning path must come first and skip the removal"


# --- review round 1 -------------------------------------------------------------------------------

def test_the_serve_script_reads_role_like_the_app_does(tmp_path):
    """process_role() trims and lowercases ROLE; the script must pick the same branch, or
    ROLE=Events would run the events app on threads."""
    out = _serve({"ROLE": " Events "}, tmp_path)
    assert "--worker-class gevent" in out


def test_a_trailing_slash_does_not_slip_past_the_guard_or_the_410(events_app, app_with_config, monkeypatch):
    # The guard lets it through (Flask's router then answers as it does on the API); the 410 is what
    # must never be dodged.
    res = events_app.test_client().get("/api/app/events/")
    assert (res.get_json(silent=True) or {}).get("error") != "NOT_ON_EVENTS"
    monkeypatch.setenv("ROLE", "api")
    monkeypatch.setenv("EVENTS_SPLIT", "on")
    assert app_with_config({}).test_client().get("/api/app/events/").status_code == 410


def test_the_split_never_ships_without_the_events_role():
    """R3: a 410 before the route is a total outage of live updates."""
    import re

    for env in ("backend/.env.staging", "backend/.env.prod"):
        text = (REPO / env).read_text()
        split_on = re.search(r"^EVENTS_SPLIT=(on|1|true|yes)\s*$", text, re.M | re.I)
        role_on = re.search(r"^EVENTS_ROLE=(on|1|true|yes)\s*$", text, re.M | re.I)
        assert not split_on or role_on, env


def test_the_workflow_events_block_is_valid_shell():
    import re

    block = re.sub(r"\$\{\{[^}]*\}\}", "X", _events_block())
    body = "if " + block.split("\n", 1)[0] + "\n" + block.split("\n", 1)[1]
    out = subprocess.run(["bash", "-n"], input="RO=x; ROLLOUT_MODE=''\n" + body, capture_output=True, text=True,
                         env=git_env())
    assert out.returncode == 0, out.stderr
