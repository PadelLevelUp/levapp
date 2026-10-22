"""PAD-588 — ``backend/scripts/rollout.sh`` starts the new container before stopping the old one.
PAD-691 — with ``--migrate`` it runs the migrate step first, in a one-shot container.

Spec: ``delivery.zero-downtime-deploy`` rules 4-7 and 9. R-028 harness: a stub ``docker`` keeps one file
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
    shift; name=""; port=""; oneshot=0
    case " $* " in *" --rm "*) oneshot=1 ;; esac
    if [ "$oneshot" = 1 ]; then
      echo "migrate-ran" >> "$STUB_HOME/migrate.log"
      exit "${STUB_MIGRATE_EXIT:-0}"
    fi
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
    if [ "$2" = "-f" ] && [ "$3" = "{{.State.Running}}" ]; then n="$4"; [ -e "$C/$n.running" ] && echo true || exit 1
    elif [ "$2" = "-f" ]; then n="$4"; [ -e "$C/$n" ] || exit 1; cat "$C/$n.restarts" 2>/dev/null || echo 0
    else [ -e "$C/$2" ] || exit 1; fi ;;
  stop) n="${@: -1}"; [ -e "$C/$n" ] || exit 1; p="$(cat "$C/$n")"; grep -vx "$p" "$STUB_HOME/healthy" > "$STUB_HOME/h.tmp" 2>/dev/null; mv "$STUB_HOME/h.tmp" "$STUB_HOME/healthy" ;;
  rm)
    shift; [ "$1" = "-f" ] && shift
    rc=0
    for n in "$@"; do [ -e "$C/$n" ] || { rc=1; continue; }; rm -f "$C/$n" "$C/$n.restarts"; done
    exit $rc ;;
  start) n="$2"; [ -e "$C/$n" ] || exit 1; cat "$C/$n" >> "$STUB_HOME/healthy" ;;
  rename) [ -e "$C/$2" ] || exit 1; [ -e "$C/$3" ] && exit 1; mv "$C/$2" "$C/$3" ;;
  logs) echo "log of ${@: -1}" ;;
  wait) rm -f "$C/$2.running"; echo 0 ;;
  *) echo "unexpected docker $*" >&2; exit 2 ;;
esac
"""

CURL_STUB = r"""#!/usr/bin/env bash
url="${@: -1}"
# B-664: the request through nginx (--resolve host:443:127.0.0.1) prints STUB_NGINX_CODE (200).
case " $* " in *" --resolve "*)
  echo "curl nginx $url" >> "$STUB_HOME/calls.log"; printf '%s' "${STUB_NGINX_CODE:-200}"; exit 0 ;;
esac; port="$(printf '%s' "$url" | sed -E 's#.*127\.0\.0\.1:([0-9]+).*#\1#')"
echo "curl $port" >> "$STUB_HOME/calls.log"
grep -qx "$port" "$STUB_HOME/healthy" 2>/dev/null
"""

# B-664: the fake clock. Every sleep is logged and returns at once.
SLEEP_STUB = r"""#!/usr/bin/env bash
echo "sleep $*" >> "$STUB_HOME/calls.log"
"""

RUN_ARGS = ["--", "--restart", "unless-stopped", "--network", "levelup_net", "repo/levelup_backend:abc123"]


@pytest.fixture
def sb(tmp_path):
    bin_dir = tmp_path / "bin"
    bin_dir.mkdir()
    for name, body in (("docker", DOCKER_STUB), ("curl", CURL_STUB), ("sleep", SLEEP_STUB)):
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


def test_a_vhost_enabled_by_symlink_is_seen_and_the_deploy_rolls(sb, tmp_path):
    """B-662: Debian's sites-enabled holds symlinks into sites-available. GNU `grep -r` skips a
    symlink met while recursing, so every deploy after the host apply fell back to stop-first."""
    available = tmp_path / "sites-available"
    available.mkdir()
    (sb["sites"] / "levapp").rename(available / "levapp")
    (sb["sites"] / "levapp").symlink_to(available / "levapp")
    live(sb, "padelapp", 5000)
    r, calls = run(sb)
    assert r.returncode == 0, r.stdout + r.stderr
    assert "no enabled vhost" not in r.stdout
    assert any(c.startswith("docker run -d --name padelapp_next -p 127.0.0.1:5002:80") for c in calls)
    assert containers(sb) == {"padelapp": "5002"}


# --- PAD-691: the migrate step (rules 4, 7, 9) -------------------------------------------------


def migrate_call(calls):
    return next(c for c in calls if c.startswith("docker run --rm --name padelapp_migrate"))


def test_the_migrate_step_runs_before_the_new_container_while_the_old_one_serves(sb):
    live(sb, "padelapp", 5000)
    r, calls = run(sb, "--migrate")
    assert r.returncode == 0, r.stdout + r.stderr
    migrated = calls.index(migrate_call(calls))
    started = index(calls, "docker run -d --name padelapp_next")
    stopped = index(calls, "docker stop -t 10 padelapp")
    assert migrated < started < stopped
    assert "old container padelapp serving on 5000 during the migrate step" in r.stdout
    assert containers(sb) == {"padelapp": "5002"}


def test_the_migrate_container_drops_the_restart_policy_and_keeps_the_rest(sb):
    live(sb, "padelapp", 5000)
    r, calls = run(sb, "--migrate")
    assert r.returncode == 0, r.stdout + r.stderr
    call = migrate_call(calls)
    assert "--restart" not in call and "unless-stopped" not in call
    assert call.endswith("--network levelup_net repo/levelup_backend:abc123 /app/scripts/migrate.sh")
    assert "-p " not in call, "the migrate container publishes no port"


def test_a_failed_migrate_step_touches_no_api_container(sb):
    live(sb, "padelapp", 5000)
    r, calls = run(sb, "--migrate", STUB_MIGRATE_EXIT="1")
    assert r.returncode == 1
    assert "migrate step failed" in r.stdout and "keeps serving on 5000" in r.stdout
    assert not any("padelapp_next" in c for c in calls if c.startswith("docker run"))
    assert not any(c.startswith("docker stop") for c in calls)
    assert containers(sb) == {"padelapp": "5000"}


def test_without_migrate_no_migrate_container_runs(sb):
    live(sb, "padelapp", 5000)
    r, calls = run(sb)
    assert r.returncode == 0, r.stdout + r.stderr
    assert not any("padelapp_migrate" in c for c in calls)
    assert not (sb["home"] / "migrate.log").exists()


def test_stop_first_migrates_after_the_stop(sb):
    live(sb, "padelapp", 5002)
    r, calls = run(sb, "--stop-first", "--migrate")
    assert r.returncode == 0, r.stdout + r.stderr
    stopped = index(calls, "docker stop -t 10 padelapp")
    migrated = calls.index(migrate_call(calls))
    started = index(calls, "docker run -d --name padelapp -p 127.0.0.1:5000:80")
    assert stopped < migrated < started
    assert containers(sb) == {"padelapp": "5000"}, "the old container is removed once the new one is healthy"


def test_stop_first_starts_the_old_container_again_when_the_migrate_step_fails(sb):
    live(sb, "padelapp", 5002)
    r, calls = run(sb, "--stop-first", "--migrate", STUB_MIGRATE_EXIT="1")
    assert r.returncode == 1
    assert "migrate step failed (stop-first)" in r.stdout
    assert "docker start padelapp" in calls
    assert containers(sb) == {"padelapp": "5002"}
    assert "5002" in (sb["home"] / "healthy").read_text().split()


def test_stop_first_starts_the_old_container_again_when_the_new_one_is_unhealthy(sb):
    live(sb, "padelapp", 5002)
    r, calls = run(sb, "--stop-first", "--migrate", STUB_NEW_IS_HEALTHY="0")
    assert r.returncode == 1
    assert "docker start padelapp" in calls
    assert containers(sb) == {"padelapp": "5002"}


def test_a_dry_run_prints_the_plan_and_changes_nothing(sb):
    live(sb, "padelapp", 5000)
    r, calls = run(sb, "--migrate", "--dry-run")
    assert r.returncode == 0, r.stdout + r.stderr
    assert "plan: rolling, ports 5000/5002, migrate yes" in r.stdout
    assert "dry-run: docker run --rm --name padelapp_migrate" in r.stderr
    assert "dry-run: docker run -d --name padelapp_next -p 127.0.0.1:5002:80" in r.stderr
    mutating = ("docker run", "docker stop", "docker rm", "docker rename", "docker start")
    assert not any(c.startswith(mutating) for c in calls), calls
    assert containers(sb) == {"padelapp": "5000"}


def test_a_stop_first_dry_run_shows_every_step(sb):
    live(sb, "padelapp", 5000)
    r, calls = run(sb, "--stop-first", "--migrate", "--dry-run")
    assert r.returncode == 0, r.stdout + r.stderr
    for step in ("docker stop -t 10 padelapp", "docker rename padelapp padelapp_old",
                 "docker run --rm --name padelapp_migrate", "docker run -d --name padelapp -p",
                 "docker rm padelapp_old"):
        assert f"dry-run: {step}" in r.stderr, step
    assert containers(sb) == {"padelapp": "5000"}


def test_an_interrupted_stop_first_leaves_old_which_is_kept_and_restored(sb):
    """Review signal: a run killed after the rename leaves only <name>_old; the next run must
    treat it as the old release, not delete it."""
    (sb["home"] / "containers" / "padelapp_old").write_text("5000\n")
    r, calls = run(sb, "--stop-first", "--migrate", STUB_MIGRATE_EXIT="1")
    assert r.returncode == 1
    assert "found padelapp_old from an interrupted run" in r.stdout
    assert "docker rm -f padelapp_old" not in calls
    assert "docker start padelapp" in calls
    assert containers(sb) == {"padelapp": "5000"}


def test_a_migrate_still_running_from_an_earlier_run_is_waited_for_not_killed(sb):
    live(sb, "padelapp", 5000)
    (sb["home"] / "containers" / "padelapp_migrate").write_text("\n")
    (sb["home"] / "containers" / "padelapp_migrate.running").write_text("")
    r, calls = run(sb, "--migrate")
    assert r.returncode == 0, r.stdout + r.stderr
    assert "still running: waiting" in r.stdout
    assert index(calls, "docker wait padelapp_migrate") < index(calls, "docker rm -f padelapp_migrate")


WORKFLOWS = Path(__file__).resolve().parents[3] / ".github" / "workflows"


@pytest.mark.parametrize(
    "workflow,name,ports,upstream,host",
    [
        ("deploy-prod.yaml", "padelapp", "5000,5002", "levapp_api", "levapp.app"),
        ("deploy-staging.yaml", "padelapp_staging", "5100,5102", "levapp_api_staging", "staging.levapp.app"),
    ],
)
def test_the_deploys_roll_the_api_through_the_script(workflow, name, ports, upstream, host):
    """Rule 4 wiring: the backend job copies rollout.sh and calls it; it no longer stops the API itself."""
    import yaml

    text = (WORKFLOWS / workflow).read_text()
    yaml.safe_load(text)  # still valid YAML
    assert 'source: "backend/scripts/rollout.sh"' in text
    # PAD-691: the deploys migrate through the script's one-shot container, inside a 30-min ssh step.
    # B-664: the request through nginx goes to the environment's own vhost.
    # B-666: each option only when the checked-out rollout.sh (a rollback's older one) accepts it.
    assert "RO=/home/${{ secrets.GCE_USER }}/rollout.sh" in text
    assert (f'bash "$RO" --name {name} --ports {ports} --upstream {upstream} $(opt --probe-host {host}) '
            "$(opt --migrate) $ROLLOUT_MODE --") in text
    deploy_step = text.split("RO=/home/${{ secrets.GCE_USER }}/rollout.sh", 1)[0].rsplit("uses: appleboy/ssh-action", 1)[1]
    assert "command_timeout: 30m" in deploy_step
    assert f"docker stop {name} ||" not in text, "the script stops the old container, after the new one answers"
    assert f"docker run -d --name {name} " not in text
    dispatch = text.split("workflow_dispatch:", 1)[1].split("concurrency:", 1)[0]
    assert "rollout:" in dispatch and "options: [ rolling, stop-first ]" in dispatch
    assert 'if [ "${{ inputs.rollout }}" = "stop-first" ]; then ROLLOUT_MODE="--stop-first"; fi' in text


def test_the_staging_sync_finds_the_port_the_api_is_on():
    """After a rolling deploy the staging API may answer on 5102; the sync's health check follows it."""
    script = (SCRIPT.parent / "sync-staging-db.sh").read_text()
    assert "127.0.0.1:5100/api/app/healthz}" not in script
    assert 'docker port "$APP_CONTAINER" 80' in script


# --- B-664: nginx's fail_timeout window after "healthy" -----------------------------------------

def test_the_old_container_serves_for_fail_timeout_plus_one_after_the_new_is_healthy(sb):
    sb["upstream"].write_text("upstream levapp_api {\n    server 127.0.0.1:5000 max_fails=1 fail_timeout=5s;\n"
                              "    server 127.0.0.1:5002 max_fails=1 fail_timeout=7s;\n}\n")
    live(sb, "padelapp", 5000)
    r, calls = run(sb, "--probe-host", "levapp.app")
    assert r.returncode == 0, r.stdout + r.stderr
    healthy = index(calls, "curl 5002")
    settle = calls.index("sleep 8")  # the idle port's (5002) fail_timeout, 7 s, plus one
    through = index(calls, "curl nginx https://levapp.app/api/app/healthz")
    stopped = index(calls, "docker stop -t 10 padelapp")
    assert healthy < settle < through < stopped


def test_fail_timeout_defaults_to_nginx_s_ten_seconds(sb):
    live(sb, "padelapp", 5000)  # the fixture's upstream lines carry no fail_timeout
    r, calls = run(sb)
    assert r.returncode == 0, r.stdout + r.stderr
    assert calls.index("sleep 11") < index(calls, "docker stop -t 10 padelapp")
    assert "skipping the request through nginx" in r.stdout


def test_a_5xx_through_nginx_keeps_the_old_container_and_removes_the_new(sb):
    live(sb, "padelapp", 5000)
    r, calls = run(sb, "--probe-host", "levapp.app", STUB_NGINX_CODE="502", PROBE_TRIES="3")
    assert r.returncode == 1
    assert len([c for c in calls if c.startswith("curl nginx")]) == 3
    assert not any(c.startswith("docker stop") for c in calls)
    assert containers(sb) == {"padelapp": "5000"}
    assert "padelapp keeps serving" in r.stdout


def test_a_4xx_through_nginx_counts_as_live(sb):
    live(sb, "padelapp", 5000)
    r, _ = run(sb, "--probe-host", "levapp.app", STUB_NGINX_CODE="404")
    assert r.returncode == 0, r.stdout + r.stderr
    assert containers(sb) == {"padelapp": "5002"}
