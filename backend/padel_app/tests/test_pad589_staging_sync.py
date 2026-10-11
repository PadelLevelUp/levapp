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
  inspect|stop|start) exit 0 ;;
esac
case " $* " in
  *" pg_dump "*) printf 'PGDMP-live-%s' "${@: -1}" ;;
  *" sh -c "*)
    # PAD-200 live path: pg_dump | pg_restore inside one sh -c
    echo "live-copy" > "$STUB_HOME/restored.dump" ;;
  *" pg_restore "*) cat > "$STUB_HOME/restored.dump" ;;
  *" psql "*)
    sql="${@: -1}"
    case "$sql" in
      *"count(*) from users"*) printf '%s\n' "${STUB_USERS:-185}" ;;
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
    assert re.search(r"update users set email", calls, re.I), "the scrub still runs"
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
