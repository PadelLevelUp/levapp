"""PAD-588 — ``backend/scripts/rollout.sh`` starts the new container before stopping the old one.

Spec: ``delivery.zero-downtime-deploy`` rules 4-7. R-028 harness: a stub ``docker`` keeps one file
per container (its published loopback port) and logs every call; a stub ``curl`` answers 200 for
the ports listed in ``$STUB_HOME/healthy``. No Docker, no network.
"""
import os
import stat
import subprocess
from pathlib import Path

import pytest

SCRIPT = Path(__file__).resolve().parents[2] / "scripts" / "rollout.sh"

DOCKER_STUB = r"""#!/usr/bin/env bash
echo "docker $*" >> "$STUB_HOME/calls.log"
C="$STUB_HOME/containers"; mkdir -p "$C"
case "$1" in
  run)
    shift; name=""; port=""
    while [ $# -gt 0 ]; do
      case "$1" in
        -d) shift ;;
        --name) name="$2"; shift 2 ;;
        -p) port="$(printf '%s' "$2" | cut -d: -f2)"; shift 2 ;;
        *) shift ;;
      esac
    done
    [ -e "$C/$name" ] && { echo "Conflict. The container name \"/$name\" is already in use" >&2; exit 125; }
    echo "$port" > "$C/$name"
    [ -n "${STUB_NEW_IS_HEALTHY:-1}" ] && [ "${STUB_NEW_IS_HEALTHY:-1}" = 1 ] && echo "$port" >> "$STUB_HOME/healthy"
    [ -n "${STUB_RESTARTS:-}" ] && echo "$STUB_RESTARTS" > "$C/$name.restarts"
    echo "cid-$name" ;;
  port) [ -e "$C/$2" ] && echo "127.0.0.1:$(cat "$C/$2")" || exit 1 ;;
  inspect)
    if [ "$2" = "-f" ]; then n="$4"; [ -e "$C/$n" ] || exit 1; cat "$C/$n.restarts" 2>/dev/null || echo 0
    else [ -e "$C/$2" ] || exit 1; fi ;;
  stop) n="${@: -1}"; [ -e "$C/$n" ] || exit 1; p="$(cat "$C/$n")"; grep -vx "$p" "$STUB_HOME/healthy" > "$STUB_HOME/h.tmp" 2>/dev/null; mv "$STUB_HOME/h.tmp" "$STUB_HOME/healthy" ;;
  rm)
    if [ "$2" = "-f" ]; then n="$3"; else n="$2"; fi
    [ -e "$C/$n" ] || exit 1; rm -f "$C/$n" "$C/$n.restarts" ;;
  rename) [ -e "$C/$2" ] || exit 1; mv "$C/$2" "$C/$3" ;;
  logs) echo "log of ${@: -1}" ;;
  *) echo "unexpected docker $*" >&2; exit 2 ;;
esac
"""

CURL_STUB = r"""#!/usr/bin/env bash
url="${@: -1}"; port="$(printf '%s' "$url" | sed -E 's#.*127\.0\.0\.1:([0-9]+).*#\1#')"
echo "curl $port" >> "$STUB_HOME/calls.log"
grep -qx "$port" "$STUB_HOME/healthy" 2>/dev/null
"""

RUN_ARGS = ["--", "--restart", "unless-stopped", "--network", "levelup_net", "repo/levelup_backend:abc123"]


@pytest.fixture
def sb(tmp_path):
    bin_dir = tmp_path / "bin"
    bin_dir.mkdir()
    for name, body in (("docker", DOCKER_STUB), ("curl", CURL_STUB)):
        p = bin_dir / name
        p.write_text(body)
        p.chmod(p.stat().st_mode | stat.S_IEXEC)
    home = tmp_path / "home"
    (home / "containers").mkdir(parents=True)
    (home / "healthy").write_text("")
    upstream = tmp_path / "levapp-api-upstream.conf"
    upstream.write_text("upstream levapp_api {\n    server 127.0.0.1:5000;\n    server 127.0.0.1:5002;\n}\n")
    sites = tmp_path / "sites-enabled"
    sites.mkdir()
    (sites / "levapp").write_text("location /api/ {\n    proxy_pass http://levapp_api;\n}\n")
    env = {
        **os.environ,
        "PATH": f"{bin_dir}:{os.environ['PATH']}",
        "STUB_HOME": str(home),
        "NGINX_UPSTREAM_CONF": str(upstream),
        "NGINX_SITES_DIR": str(sites),
        "HEALTH_TIMEOUT": "3",
        "POLL_SECONDS": "1",
    }
    return {"env": env, "home": home, "upstream": upstream, "sites": sites}


def live(sb, name, port):
    (sb["home"] / "containers" / name).write_text(f"{port}\n")
    with open(sb["home"] / "healthy", "a") as f:
        f.write(f"{port}\n")


def run(sb, *extra, **env):
    args = ["bash", str(SCRIPT), "--name", "padelapp", "--ports", "5000,5002", "--upstream", "levapp_api", *extra, *RUN_ARGS]
    r = subprocess.run(args, env={**sb["env"], **env}, capture_output=True, text=True, timeout=60)
    calls = (sb["home"] / "calls.log").read_text().splitlines() if (sb["home"] / "calls.log").exists() else []
    return r, calls


def containers(sb):
    return {p.name: p.read_text().strip() for p in (sb["home"] / "containers").iterdir() if "." not in p.name}


def index(calls, prefix):
    return next(i for i, c in enumerate(calls) if c.startswith(prefix))


def test_the_new_container_is_healthy_before_the_old_one_stops(sb):
    live(sb, "padelapp", 5000)
    r, calls = run(sb)
    assert r.returncode == 0, r.stdout + r.stderr
    started = index(calls, "docker run -d --name padelapp_next -p 127.0.0.1:5002:80")
    healthy = index(calls, "curl 5002")
    stopped = index(calls, "docker stop -t 10 padelapp")
    assert started < healthy < stopped, "start, health, then stop"
    assert not any(c.startswith("docker stop") for c in calls[:healthy])
    assert containers(sb) == {"padelapp": "5002"}, "the stable name serves on the other port"


def test_ports_alternate_across_deploys(sb):
    live(sb, "padelapp", 5002)
    r, _ = run(sb)
    assert r.returncode == 0, r.stdout + r.stderr
    assert containers(sb) == {"padelapp": "5000"}


def test_an_unhealthy_new_container_is_removed_and_the_old_keeps_serving(sb):
    live(sb, "padelapp", 5000)
    r, calls = run(sb, STUB_NEW_IS_HEALTHY="0")
    assert r.returncode == 1
    assert "keeps serving" in r.stdout
    assert not any(c.startswith("docker stop") for c in calls)
    assert containers(sb) == {"padelapp": "5000"}


def test_a_crash_looping_new_container_fails_fast(sb):
    live(sb, "padelapp", 5000)
    r, calls = run(sb, STUB_NEW_IS_HEALTHY="0", STUB_RESTARTS="2")
    assert r.returncode == 1
    assert "restarted 2 time(s)" in r.stdout
    assert containers(sb) == {"padelapp": "5000"}


def test_without_the_upstream_on_the_host_it_falls_back_to_stop_first(sb):
    sb["upstream"].unlink()
    live(sb, "padelapp", 5000)
    r, calls = run(sb)
    assert r.returncode == 0, r.stdout + r.stderr
    assert "stop-first (rule 6)" in r.stdout
    assert index(calls, "docker stop -t 10 padelapp") < index(calls, "docker run -d --name padelapp -p 127.0.0.1:5000:80")
    assert containers(sb) == {"padelapp": "5000"}, "port A, the one nginx proxies to without an upstream"


def test_stop_first_by_hand(sb):
    live(sb, "padelapp", 5002)
    r, calls = run(sb, "--stop-first")
    assert r.returncode == 0, r.stdout + r.stderr
    assert containers(sb) == {"padelapp": "5000"}
    assert not any("padelapp_next" in c for c in calls if c.startswith("docker run"))


def test_a_first_deploy_with_no_container_starts_on_the_first_port(sb):
    r, _ = run(sb)
    assert r.returncode == 0, r.stdout + r.stderr
    assert containers(sb) == {"padelapp": "5000"}


def test_a_leftover_next_container_is_cleared_first(sb):
    live(sb, "padelapp", 5000)
    (sb["home"] / "containers" / "padelapp_next").write_text("5002\n")
    r, _ = run(sb)
    assert r.returncode == 0, r.stdout + r.stderr
    assert containers(sb) == {"padelapp": "5002"}


def test_an_upstream_no_vhost_uses_still_means_stop_first(sb):
    (sb["sites"] / "levapp").write_text("location /api/ {\n    proxy_pass http://127.0.0.1:5000;\n}\n")
    live(sb, "padelapp", 5000)
    r, _ = run(sb)
    assert r.returncode == 0, r.stdout + r.stderr
    assert "no enabled vhost" in r.stdout
    assert containers(sb) == {"padelapp": "5000"}
