"""PAD-589 — ``backend/scripts/sync-staging-db.sh`` restores staging from the nightly dump.

Spec: ``.specflow/specs/delivery/staging-data-sync.spec.md``. Same harness as
``test_backup_script.py`` (compass R-028): stub ``docker``, ``gsutil`` and ``curl`` on PATH append
their arguments to ``calls.log``; the bucket is a directory. No Docker, Postgres or network.
"""
import os
import re
import stat
import subprocess
from pathlib import Path

import pytest

BACKEND = Path(__file__).resolve().parents[2]
SCRIPT = BACKEND / "scripts" / "sync-staging-db.sh"
WORKFLOW = BACKEND.parent / ".github" / "workflows" / "deploy-staging.yaml"

DOCKER_STUB = r"""#!/usr/bin/env bash
echo "docker $*" >> "$STUB_HOME/calls.log"
case "$1" in
  image)
    # the image's own ENV (PAD-691: left out of the migrate env-file)
    echo '["PATH=/usr/local/bin:/usr/bin", "SCHEMA_GATE=on"]'; exit 0 ;;
  inspect)
    case "$*" in
      # PAD-695: the worker container exists only when the test says so
      *_worker) [ -n "${STUB_WORKER:-}" ] || exit 1 ;;
      # PAD-697: likewise the events container
      *_events) [ -n "${STUB_EVENTS:-}" ] || exit 1 ;;
      # PAD-704: the second API copy, likewise
      *_b) [ -n "${STUB_SECOND:-}" ] || exit 1 ;;
      *Config.Image*) echo "repo/levelup_backend:staging" ;;
      *HostConfig.NetworkMode*) echo "levelup_net" ;;
      *"json .Config.Env"*) echo '["PATH=/usr/local/bin:/usr/bin", "SCHEMA_GATE=on", "POSTGRES_DB=padel_app_staging", "VAPID_PRIVATE_KEY=-----BEGIN KEY-----\nabc\n-----END KEY-----", "MAIL_PASSWORD=a=b c"]' ;;
    esac
    exit 0 ;;
  stop|start) exit 0 ;;
  rm) exit 0 ;;
  run)
    # PAD-691: the one-shot migrate container; keep a copy of the env-file it was given
    prev=""; for a in "$@"; do [ "$prev" = "--env-file" ] && { cp "$a" "$STUB_HOME/migrate.env"; ls -l "$a" | cut -c1-10 > "$STUB_HOME/migrate.env.mode"; echo "$a" > "$STUB_HOME/migrate.env.path"; }; prev="$a"; done
    exit "${STUB_MIGRATE_EXIT:-0}" ;;
esac
case " $* " in
  *" pg_dump "*) printf 'PGDMP-live-%s' "${@: -1}" ;;
  *" sh -c "*)
    # PAD-200 live path: pg_dump | pg_restore inside one sh -c
    echo "live-copy" > "$STUB_HOME/restored.dump" ;;
  *" pg_restore "*) cat > "$STUB_HOME/restored.dump" ;;
  *" psql "*" ON_ERROR_STOP=1 "*)
    # PAD-606: the scrub file arrives on stdin
    cat > "$STUB_HOME/scrub.sql"
    [ -n "${STUB_SCRUB_FAILS:-}" ] && { echo "ERROR: scrub failed" >&2; exit 3; }
    : ;;
  *" psql "*)
    sql="${@: -1}"
    case "$sql" in
      *"count(*) from users"*) printf '%s\n' "${STUB_USERS:-185}" ;;
      *"drop schema"*) [ -n "${STUB_WIPE_FAILS:-}" ] && exit 1; : ;;
      *"count(*)"*) printf '0\n' ;;
      *) : ;;
    esac ;;
  *) : ;;
esac
"""

GSUTIL_STUB = r'''#!/usr/bin/env bash
echo "gsutil $*" >> "$STUB_HOME/calls.log"
to_path() { local u="$1"; u="${u#gs://}"; u="${u#*/}"; printf '%s/%s' "$STUB_BUCKET_DIR" "$u"; }
case "$1" in
  cp) p="$(to_path "$2")"; [ -f "$p" ] || { echo "No URLs matched: $2" >&2; exit 1; }; cat "$p" ;;
  stat) p="$(to_path "$2")"; [ -f "$p" ] || exit 1
        printf '%s:\n    Content-Length:          %s\n' "$2" "$(wc -c < "$p" | tr -d ' ')" ;;
  ls) p="$(to_path "${@: -1}")"; [ -d "$p" ] || { echo "CommandException: One or more URLs matched no objects." >&2; exit 1; }
      for f in "$p"/*; do [ -f "$f" ] && printf '%s%s\n' "${@: -1}" "$(basename "$f")"; done ;;
  *) echo "unexpected gsutil $*" >&2; exit 2 ;;
esac
'''

CURL_STUB = "#!/usr/bin/env bash\necho \"curl $*\" >> \"$STUB_HOME/calls.log\"\nexit 0\n"

OLD = "padel_app-2026-10-09_0300.dump"
NEW = "padel_app-2026-10-10_0300.dump"


@pytest.fixture
def sandbox(tmp_path):
    bin_dir = tmp_path / "bin"
    bin_dir.mkdir()
    for name, body in (("docker", DOCKER_STUB), ("gsutil", GSUTIL_STUB), ("curl", CURL_STUB)):
        p = bin_dir / name
        p.write_text(body)
        p.chmod(p.stat().st_mode | stat.S_IEXEC)
    home = tmp_path / "home"
    home.mkdir()
    bucket = tmp_path / "bucket"
    (bucket / "padel_app").mkdir(parents=True)
    (bucket / "padel_app_staging").mkdir()
    (bucket / "padel_app" / OLD).write_bytes(b"PGDMP-old")
    (bucket / "padel_app" / NEW).write_bytes(b"PGDMP-new")
    # A newer staging dump must never be picked: only the padel_app/ prefix is a source.
    (bucket / "padel_app_staging" / "padel_app_staging-2026-10-10_0400.dump").write_bytes(b"PGDMP-staging")
    (home / ".env.staging").write_text("POSTGRES_USER=padel_app_user\nPOSTGRES_DB=padel_app_staging\n")
    (home / ".backup.env").write_text("BACKUP_BUCKET=gs://unit-test-bucket\n")
    env = {
        **os.environ,
        "PATH": f"{bin_dir}:{os.environ['PATH']}",
        "HOME": str(home),
        "STUB_HOME": str(home),
        "STUB_BUCKET_DIR": str(bucket),
        "MIN_FREE_MB": "0",
        "HEALTH_URL": "http://127.0.0.1:1/healthz",
    }
    for key in ("GCS_UPLOADS_BUCKET", "BACKUP_BUCKET", "SYNC_STATE_FILE"):
        env.pop(key, None)
    return {"env": env, "home": home, "bucket": bucket}


def run(sandbox, mode=None, **overrides):
    env = {**sandbox["env"], **overrides}
    args = ["bash", str(SCRIPT), str(sandbox["home"] / ".env.staging")] + ([mode] if mode else [])
    result = subprocess.run(args, env=env, capture_output=True, text=True, timeout=120)
    calls_file = sandbox["home"] / "calls.log"
    calls = calls_file.read_text() if calls_file.exists() else ""
    return result, calls


def state(sandbox):
    p = sandbox["home"] / "staging-sync.state"
    return p.read_text().strip() if p.exists() else None


def restored(sandbox):
    p = sandbox["home"] / "restored.dump"
    return p.read_bytes() if p.exists() else None


def test_the_restore_is_migrated_to_head_before_the_app_starts(sandbox):
    """PAD-691 (zero-downtime-deploy rule 9): the app no longer migrates itself, so the sync runs
    the migrate step in a one-shot container of the app's own image, env and network first."""
    (sandbox["home"] / "staging-sync.state").write_text(f"gs://unit-test-bucket/padel_app/{OLD}\n")
    result, calls = run(sandbox)
    assert result.returncode == 0, result.stdout + result.stderr
    lines = calls.splitlines()
    migrate = next(i for i, c in enumerate(lines) if c.startswith("docker run --rm --name padelapp_staging_migrate"))
    started = lines.index("docker start padelapp_staging")
    restored_at = next(i for i, c in enumerate(lines) if "pg_restore" in c)
    assert restored_at < migrate < started
    call = lines[migrate]
    assert "--network levelup_net" in call
    assert call.endswith("repo/levelup_backend:staging /app/scripts/migrate.sh")
    assert " -e " not in call, "secrets never go on the command line"
    home = sandbox["home"]
    # the image's own ENV is left out, a multi-line value is left out and named, '=' and spaces pass
    assert (home / "migrate.env").read_text() == "POSTGRES_DB=padel_app_staging\nMAIL_PASSWORD=a=b c\n"
    assert "not passed to the migrate step (multi-line): VAPID_PRIVATE_KEY" in result.stdout
    assert (home / "migrate.env.mode").read_text().startswith("-rw-------")
    assert not Path((home / "migrate.env.path").read_text().strip()).exists(), "the env-file is removed"


def test_a_failed_migrate_step_still_starts_the_app(sandbox):
    (sandbox["home"] / "staging-sync.state").write_text(f"gs://unit-test-bucket/padel_app/{OLD}\n")
    result, calls = run(sandbox, STUB_MIGRATE_EXIT="1")
    assert result.returncode == 0, "best-effort: the sync never fails the deploy"
    assert "the migrate step exited 1" in result.stdout
    assert "docker start padelapp_staging" in calls


def test_a_push_after_the_dump_was_restored_leaves_staging_alone(sandbox):
    (sandbox["home"] / "staging-sync.state").write_text(f"gs://unit-test-bucket/padel_app/{NEW}\n")
    result, calls = run(sandbox)
    assert result.returncode == 0, result.stdout + result.stderr
    assert f"SKIPPED: gs://unit-test-bucket/padel_app/{NEW} already restored" in result.stdout
    assert "docker stop" not in calls
    assert "pg_restore" not in calls and "pg_dump" not in calls


def test_a_new_nightly_dump_is_restored_from_gcs_not_from_prod(sandbox):
    (sandbox["home"] / "staging-sync.state").write_text(f"gs://unit-test-bucket/padel_app/{OLD}\n")
    result, calls = run(sandbox)
    assert result.returncode == 0, result.stdout + result.stderr
    assert restored(sandbox) == b"PGDMP-new"
    assert f"gsutil cp gs://unit-test-bucket/padel_app/{NEW} -" in calls
    assert "pg_dump" not in calls, "routine syncs never read the live database"
    assert "docker stop padelapp_staging" in calls and "docker start padelapp_staging" in calls
    assert "psql -U padel_app_user -d padel_app_staging -q -1 -v ON_ERROR_STOP=1" in calls, "the scrub runs (PAD-606)"
    assert "UPDATE users" in (sandbox["home"] / "scrub.sql").read_text(), "it is fed staging-scrub.sql"
    assert state(sandbox) == f"gs://unit-test-bucket/padel_app/{NEW}"


def test_the_first_run_with_no_state_restores_the_newest_dump(sandbox):
    result, _ = run(sandbox)
    assert result.returncode == 0, result.stdout + result.stderr
    assert restored(sandbox) == b"PGDMP-new"
    assert state(sandbox) == f"gs://unit-test-bucket/padel_app/{NEW}"


def test_a_restore_that_produced_no_users_is_retried_next_time(sandbox):
    (sandbox["home"] / "staging-sync.state").write_text(f"gs://unit-test-bucket/padel_app/{OLD}\n")
    result, _ = run(sandbox, STUB_USERS="0")
    assert result.returncode == 0, result.stdout + result.stderr
    assert state(sandbox) == f"gs://unit-test-bucket/padel_app/{OLD}"


def test_reload_restores_the_already_restored_dump_again(sandbox):
    (sandbox["home"] / "staging-sync.state").write_text(f"gs://unit-test-bucket/padel_app/{NEW}\n")
    result, calls = run(sandbox, "reload")
    assert result.returncode == 0, result.stdout + result.stderr
    assert restored(sandbox) == b"PGDMP-new"
    assert "pg_dump" not in calls


def test_live_copies_prod_and_records_no_state(sandbox):
    (sandbox["home"] / "staging-sync.state").write_text(f"gs://unit-test-bucket/padel_app/{NEW}\n")
    result, calls = run(sandbox, "live")
    assert result.returncode == 0, result.stdout + result.stderr
    assert "pg_dump -U 'padel_app_user' -Fc 'padel_app'" in calls
    assert state(sandbox) == f"gs://unit-test-bucket/padel_app/{NEW}"


def test_an_unknown_mode_is_refused_without_stopping_staging(sandbox):
    result, calls = run(sandbox, "everything")
    assert result.returncode == 0
    assert "SKIPPED: unknown mode" in result.stdout
    assert "docker stop" not in calls


@pytest.mark.parametrize("case", ["no-dump", "no-bucket"])
def test_no_source_means_no_stop(sandbox, case):
    if case == "no-dump":
        for f in (sandbox["bucket"] / "padel_app").iterdir():
            f.unlink()
    else:
        (sandbox["home"] / ".backup.env").write_text("")
    result, calls = run(sandbox)
    assert result.returncode == 0
    assert "SKIPPED:" in result.stdout
    assert "docker stop" not in calls and "pg_restore" not in calls


def test_an_empty_dump_object_is_never_restored(sandbox):
    (sandbox["bucket"] / "padel_app" / NEW).write_bytes(b"")
    result, calls = run(sandbox)
    assert result.returncode == 0
    assert "SKIPPED:" in result.stdout
    assert "docker stop" not in calls


def test_a_stale_backup_is_reported_and_still_restored(sandbox):
    # The newest stamp is 2026-10-10 03:00 UTC; pin "now" to 2026-10-13 00:00 UTC (> 48 h later).
    result, _ = run(sandbox, SYNC_NOW_EPOCH="1791849600")
    assert result.returncode == 0, result.stdout + result.stderr
    assert "WARNING: newest backup is from 2026-10-10_0300" in result.stdout


def test_the_workflow_passes_the_mode_and_offers_three():
    text = WORKFLOW.read_text()
    dispatch = text.split("workflow_dispatch:", 1)[1].split("concurrency:", 1)[0]
    block = re.search(r"sync_db:\n((?:\s{8}.*\n)+)", dispatch)
    assert block, "workflow_dispatch input sync_db"
    assert re.search(r"options:\s*\[\s*auto,\s*reload,\s*live\s*\]", block.group(1))
    job = text.split("\n  sync-db:\n", 1)[1].split("\n  frontend:\n", 1)[0]
    assert "${{ inputs.sync_db || 'auto' }}" in job


def test_a_failed_scrub_wipes_staging_and_records_nothing(sandbox):
    """PAD-606 rule 9: fail closed. Staging comes up empty rather than with unscrubbed data, and the
    dump is not recorded, so the next push restores and scrubs again."""
    (sandbox["home"] / "staging-sync.state").write_text(f"gs://unit-test-bucket/padel_app/{OLD}\n")
    result, calls = run(sandbox, STUB_SCRUB_FAILS="1")
    assert result.returncode == 3, "a failed scrub fails the sync-db job (rule 9): " + result.stdout + result.stderr
    assert "the scrub failed; wiping padel_app_staging" in result.stdout
    assert calls.rfind("drop schema if exists public cascade") > calls.find("ON_ERROR_STOP=1")
    assert "docker start padelapp_staging" in calls, "the app still comes back (empty)"
    assert state(sandbox) == f"gs://unit-test-bucket/padel_app/{OLD}"


def test_a_failed_scrub_whose_wipe_fails_leaves_staging_stopped(sandbox):
    """PAD-606 rule 9: if staging cannot be wiped either, it may hold unscrubbed data. The app is not
    started again, and the exit code (4) tells the deploy apart from a wiped, empty staging (3)."""
    result, calls = run(sandbox, STUB_SCRUB_FAILS="1", STUB_WIPE_FAILS="1")
    assert result.returncode == 4, result.stdout + result.stderr
    assert "may hold unscrubbed data" in result.stdout
    after_scrub = calls[calls.find("ON_ERROR_STOP=1"):]
    assert "docker start padelapp_staging" not in after_scrub, "never serve what could not be scrubbed"


def test_an_already_restored_dump_is_skipped_with_exit_zero(sandbox):
    """The exit code separates "nothing new, skipped" (0) from a failed scrub (3, 4)."""
    first, _ = run(sandbox)
    assert first.returncode == 0, first.stdout + first.stderr
    (sandbox["home"] / "calls.log").unlink()
    result, calls = run(sandbox, STUB_SCRUB_FAILS="1")
    assert result.returncode == 0, result.stdout + result.stderr
    assert "SKIPPED" in result.stdout and "ON_ERROR_STOP=1" not in calls


def test_the_workflow_fails_the_sync_job_on_a_failed_scrub():
    """PAD-606 rule 9: the sync-db job no longer swallows the script's exit, and puts the scrub's
    lines in the job summary; the job stays continue-on-error, so the deploy does not fail (rule 6)."""
    job = WORKFLOW.read_text().split("\n  sync-db:\n", 1)[1].split("\n  frontend:\n", 1)[0]
    assert "continue-on-error: true" in job
    sync_line = next(line for line in job.splitlines() if "sync-staging-db.sh /home/" in line)
    assert "|| true" not in sync_line
    assert 'echo "SYNC_EXIT=$?"' in job and "capture_stdout: true" in job
    verdict = job.split("name: Scrub verdict", 1)[1]
    assert "if: always()" in verdict and "GITHUB_STEP_SUMMARY" in verdict
    assert re.search(r"3\)[^\n]*exit 3", verdict) and re.search(r"4\)[^\n]*exit 4", verdict)


def test_the_worker_is_stopped_with_the_app_and_started_after_it(sandbox):
    """PAD-695 (delivery.worker-role): a worker holds connections to the target and would run jobs
    on a half-restored database."""
    result, calls = run(sandbox, "reload", STUB_WORKER="1")
    lines = calls.splitlines()
    assert lines.index("docker stop padelapp_staging") < lines.index("docker stop -t 60 padelapp_staging_worker")
    stopped_worker = lines.index("docker stop -t 60 padelapp_staging_worker")
    restore = next(i for i, c in enumerate(lines) if "pg_restore" in c or " sh -c " in c)
    assert stopped_worker < restore
    assert lines.index("docker start padelapp_staging") < lines.index("docker start padelapp_staging_worker")


def test_without_a_worker_the_sync_touches_none(sandbox):
    result, calls = run(sandbox, "reload")
    assert "padelapp_staging_worker" not in calls.replace("docker inspect padelapp_staging_worker", "")


def test_the_events_container_is_stopped_with_the_app_and_started_after_it(sandbox):
    """PAD-697 (delivery.events-role rule 10): its listener and stream handshakes would hit a wiped
    schema mid-restore."""
    result, calls = run(sandbox, "reload", STUB_EVENTS="1")
    lines = calls.splitlines()
    stopped = next(i for i, c in enumerate(lines) if c.startswith("docker stop") and c.endswith(" padelapp_staging_events"))
    restore = next(i for i, c in enumerate(lines) if "pg_restore" in c or " sh -c " in c)
    assert lines.index("docker stop padelapp_staging") < stopped < restore
    assert lines.index("docker start padelapp_staging") < lines.index("docker start padelapp_staging_events")


def test_without_an_events_container_the_sync_touches_none(sandbox):
    result, calls = run(sandbox, "reload")
    assert "padelapp_staging_events" not in calls.replace("docker inspect padelapp_staging_events", "")


def test_the_second_copy_is_stopped_with_the_app_and_started_after_it(sandbox):
    """PAD-704 (zero-downtime-deploy rule 14): padelapp_staging_b holds connections to the target too."""
    result, calls = run(sandbox, "reload", STUB_SECOND="1")
    lines = calls.splitlines()
    stopped = lines.index("docker stop padelapp_staging_b")
    restore = next(i for i, c in enumerate(lines) if "pg_restore" in c or " sh -c " in c)
    assert lines.index("docker stop padelapp_staging") < stopped < restore
    assert lines.index("docker start padelapp_staging") < lines.index("docker start padelapp_staging_b")
