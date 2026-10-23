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
    "workflow,name,ports,upstream,host,drain",
    [
        # PAD-714: the drain is staging's only until it is measured there (no prod change).
        ("deploy-prod.yaml", "padelapp", "5000,5002", "levapp_api", "levapp.app", ""),
        ("deploy-staging.yaml", "padelapp_staging", "5100,5102", "levapp_api_staging", "staging.levapp.app",
         "$(opt --drain) "),
    ],
)
def test_the_deploys_roll_the_api_through_the_script(workflow, name, ports, upstream, host, drain):
    """Rule 4 wiring: the backend job copies rollout.sh and calls it; it no longer stops the API itself."""
    import yaml

    text = (WORKFLOWS / workflow).read_text()
    yaml.safe_load(text)  # still valid YAML
    assert 'source: "backend/scripts/rollout.sh"' in text
    # PAD-691: the deploys migrate through the script's one-shot container, inside a 30-min ssh step.
    # B-664: the request through nginx goes to the environment's own vhost.
    # B-666: each option only when the checked-out rollout.sh (a rollback's older one) accepts it.
    # PAD-695: --worker when the env file turns WORKER_SPLIT on (delivery.worker-role), filtered too.
    assert "RO=/home/${{ secrets.GCE_USER }}/rollout.sh" in text
    assert "then WORKER_OPT=\"--worker\"; fi" in text
    assert (f'bash "$RO" --name {name} --ports {ports} --upstream {upstream} $(opt --probe-host {host}) '
            '$(opt --migrate) $([ -z "$WORKER_OPT" ] || opt --worker) $([ "$API_COPIES" != 2 ] || opt --copies 2) '
            f'{drain}$ROLLOUT_MODE --') in text
    if not drain:
        assert "--drain" not in text
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


# --- PAD-714 (rule 16, B-663): --drain takes a port out of nginx's rotation around both edges -------

HELPER = Path(__file__).resolve().parents[3] / "infra" / "nginx" / "levapp-upstream-port"

# The stub nginx: `-t` passes unless STUB_NGINX_T_FAIL; each reload logs the ports then marked down.
NGINX_STUB = r"""#!/usr/bin/env bash
if [ "$1" = "-t" ]; then echo "nginx -t" >> "$STUB_HOME/calls.log"; [ -z "${STUB_NGINX_T_FAIL:-}" ]; exit; fi
downs=$(grep -E 'down;' "$NGINX_UPSTREAM_CONF" | sed -E 's/.*:([0-9]+).*/\1/' | sort | paste -sd, -)
echo "reload down=$downs" >> "$STUB_HOME/calls.log"
"""


@pytest.fixture
def dsb(sb, tmp_path):
    p = tmp_path / "bin" / "nginx"
    p.write_text(NGINX_STUB)
    p.chmod(p.stat().st_mode | stat.S_IEXEC)
    sb["upstream"].write_text("upstream levapp_api {\n    server 127.0.0.1:5000 max_fails=1 fail_timeout=5s;\n"
                              "    server 127.0.0.1:5002 max_fails=1 fail_timeout=5s;\n}\n")
    sb["env"].update({"NGINX_DRAIN_CMD": str(HELPER), "LEVAPP_UPSTREAM_DIR": str(tmp_path)})
    return sb


def reloads(calls):
    return [c for c in calls if c.startswith("reload ")]


def test_each_edge_happens_on_a_port_nginx_does_not_send_to(dsb):
    live(dsb, "padelapp", 5000)
    r, calls = run(dsb, "--drain", "--probe-host", "levapp.app")
    assert r.returncode == 0, r.stdout + r.stderr
    idle_down = calls.index("reload down=5002")
    boot = index(calls, "docker run -d --name padelapp_next")
    healthy = index(calls, "curl 5002")
    idle_up = calls.index("reload down=", idle_down + 1)
    through = index(calls, "curl nginx")
    live_down = calls.index("reload down=5000")
    stop = index(calls, "docker stop -t 10 padelapp")
    live_up = calls.index("reload down=", stop)
    assert idle_down < boot < healthy < idle_up < through < live_down < stop < live_up
    assert calls[idle_down + 1] == "sleep 2" and calls[live_down + 1] == "sleep 2", "reload returns before new workers serve"
    assert reloads(calls) == ["reload down=5002", "reload down=", "reload down=5000", "reload down="]
    assert "sleep 6" not in calls, "the boot port took no request, so no fail_timeout wait (B-664)"
    assert " down" not in dsb["upstream"].read_text(), "no port is left down"
    assert containers(dsb) == {"padelapp": "5002"}


def test_without_the_host_step_the_swap_is_exactly_as_before(dsb, sb):
    live(dsb, "padelapp", 5000)
    r, calls = run(dsb, "--drain", "--probe-host", "levapp.app", NGINX_DRAIN_CMD="false")
    assert r.returncode == 0, r.stdout + r.stderr
    assert r.stdout.count("swapping without the drain, as before (B-663)") == 1
    assert not reloads(calls) and "nginx -t" not in calls
    assert calls.index("sleep 6") < index(calls, "docker stop -t 10 padelapp"), "B-664's wait is back"


def test_a_failed_probe_through_nginx_leaves_both_ports_up_and_the_old_one_serving(dsb):
    live(dsb, "padelapp", 5000)
    r, calls = run(dsb, "--drain", "--probe-host", "levapp.app", STUB_NGINX_CODE="502", PROBE_TRIES="2")
    assert r.returncode == 1
    assert not any(c.startswith("docker stop") for c in calls)
    assert "reload down=5000" not in calls, "the old port never left the rotation"
    assert reloads(calls)[-1] == "reload down="
    assert " down" not in dsb["upstream"].read_text()
    assert containers(dsb) == {"padelapp": "5000"}


def test_an_unhealthy_new_container_leaves_no_port_down(dsb):
    live(dsb, "padelapp", 5000)
    r, calls = run(dsb, "--drain", STUB_NEW_IS_HEALTHY="0")
    assert r.returncode == 1
    assert reloads(calls) == ["reload down=5002", "reload down="]
    assert " down" not in dsb["upstream"].read_text()
    assert containers(dsb) == {"padelapp": "5000"}


def test_a_down_left_by_a_killed_run_is_cleared(dsb):
    dsb["upstream"].write_text(dsb["upstream"].read_text().replace("5000 max_fails=1 fail_timeout=5s;",
                                                                   "5000 max_fails=1 fail_timeout=5s down;"))
    live(dsb, "padelapp", 5000)
    r, calls = run(dsb, "--drain")
    assert r.returncode == 0, r.stdout + r.stderr
    assert reloads(calls)[0] == "reload down=5002", "the live port is put back up in the same reload"


def test_with_two_copies_the_second_copy_stops_and_boots_out_of_rotation(dsb):
    live(dsb, "padelapp", 5000)
    live(dsb, "padelapp_b", 5002)
    r, calls = run(dsb, "--drain", "--copies", "2")
    assert r.returncode == 0, r.stdout + r.stderr
    idle_down = calls.index("reload down=5002")
    assert idle_down < index(calls, "docker stop -t 10 padelapp_b") < index(calls, "docker run -d --name padelapp_next")
    stop_old = calls.index("docker stop -t 10 padelapp")
    boot_b = index(calls, "docker run -d --name padelapp_b")
    up_again = len(calls) - 1 - calls[::-1].index("reload down=")
    assert calls.index("reload down=5000") < stop_old < boot_b < up_again
    assert not any(c == "reload down=" for c in calls[stop_old:boot_b]), "the freed port stays down until _b answers"
    assert " down" not in dsb["upstream"].read_text()
    assert containers(dsb) == {"padelapp": "5002", "padelapp_b": "5000"}


def test_a_drain_dry_run_prints_the_reloads_and_changes_nothing(dsb):
    live(dsb, "padelapp", 5000)
    r, calls = run(dsb, "--drain", "--dry-run")
    assert r.returncode == 0, r.stdout + r.stderr
    assert "levapp_api 5002=down 5000=up" in r.stderr and "levapp_api 5000=down" in r.stderr
    assert not reloads(calls)


# The helper on its own: only the named block's lines, only an allowed file, put back on refusal.

SHARED = ("upstream levapp_api {\n    server 127.0.0.1:5000 max_fails=1 fail_timeout=5s;\n"
          "    server 127.0.0.1:5002 max_fails=1 fail_timeout=5s;\n}\n\n"
          "upstream levapp_api_staging {\n    server 127.0.0.1:5100 max_fails=1 fail_timeout=5s;\n"
          "    server 127.0.0.1:5102 max_fails=1 fail_timeout=5s;\n}\n")


def helper(dsb, *args, **env):
    return subprocess.run([str(HELPER), *args], env={**dsb["env"], **env}, capture_output=True, text=True, timeout=30)


def test_the_helper_edits_only_the_named_upstream(dsb):
    dsb["upstream"].write_text(SHARED)
    assert helper(dsb, str(dsb["upstream"]), "levapp_api_staging", "5102=down").returncode == 0
    text = dsb["upstream"].read_text()
    assert "server 127.0.0.1:5102 max_fails=1 fail_timeout=5s down;" in text
    assert text.replace(" down;", ";") == SHARED, "nothing else changed, prod's block included"
    assert helper(dsb, str(dsb["upstream"]), "levapp_api_staging", "5102=down").returncode == 0
    assert dsb["upstream"].read_text().count(" down;") == 1, "idempotent"
    assert helper(dsb, str(dsb["upstream"]), "levapp_api_staging", "5102=up", "5100=up").returncode == 0
    assert dsb["upstream"].read_text() == SHARED


def test_the_helper_puts_the_file_back_when_nginx_refuses_it(dsb):
    dsb["upstream"].write_text(SHARED)
    r = helper(dsb, str(dsb["upstream"]), "levapp_api", "5000=down", STUB_NGINX_T_FAIL="1")
    assert r.returncode == 1 and "restored" in r.stderr
    assert dsb["upstream"].read_text() == SHARED


@pytest.mark.parametrize("args", [
    ("/etc/passwd", "levapp_api", "5000=down"),
    ("{dir}/../levapp-api-upstream.conf", "levapp_api", "5000=down"),
    ("{dir}/other.conf", "levapp_api", "5000=down"),
    ("{conf}", "levapp_api; evil", "5000=down"),
    ("{conf}", "levapp_api", "5000=drop"),
    ("{conf}", "nope", "5000=down"),
])
def test_the_helper_refuses_anything_else(dsb, tmp_path, args):
    dsb["upstream"].write_text(SHARED)
    (tmp_path / "other.conf").write_text(SHARED)
    args = [a.format(dir=tmp_path, conf=dsb["upstream"]) for a in args]
    r = helper(dsb, *args)
    assert r.returncode == 2, r.stderr
    assert dsb["upstream"].read_text() == SHARED


def test_the_helper_ignores_the_test_directory_as_root():
    text = HELPER.read_text()
    assert '[ "$(id -u)" != 0 ] && [ -n "${LEVAPP_UPSTREAM_DIR:-}" ] && dir="$LEVAPP_UPSTREAM_DIR"' in text
    assert "dir=/etc/nginx/conf.d" in text
