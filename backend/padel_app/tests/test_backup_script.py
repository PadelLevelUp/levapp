"""PAD-296 / B-080 / B-091 — ``backend/scripts/backup.sh`` (compass R-028).

The script is exercised with stub ``docker`` and ``gsutil`` executables on PATH,
so the test needs no Docker, no Postgres and no network. Each stub appends the
arguments it was called with to ``calls.log`` and behaves like the real tool for
the calls the script makes.
"""
import os
import stat
import subprocess
from pathlib import Path

import pytest

SCRIPT = Path(__file__).resolve().parents[2] / "scripts" / "backup.sh"

DOCKER_STUB = r"""#!/usr/bin/env bash
# docker exec <container> pg_dump -U <user> -Fc <db>
# docker exec -i <container> pg_restore -U <user> -d <db> ...      (stdin: the dump)
# docker exec <container> psql -U <user> -d <db> -Atc "<sql>"
echo "docker $*" >> "$STUB_HOME/calls.log"
case " $* " in
  *" pg_dump "*)
    if [ -n "${STUB_PG_DUMP_FAILS:-}" ]; then echo "pg_dump: error: connection refused" >&2; exit 1; fi
    db="${@: -1}"; printf 'PGDMP-%s-payload' "$db" ;;
  *" pg_restore "*)
    cat > "$STUB_HOME/restored.dump"
    if [ -n "${STUB_PG_RESTORE_FAILS:-}" ]; then echo "pg_restore: error: could not read from input file" >&2; exit 1; fi ;;
  *" psql "*)
    sql="${@: -1}"
    case "$sql" in
      *"count(*)"*) printf '%s\n' "${STUB_USERS:-185}" ;;
      *) : ;;
    esac ;;
  *) echo "unexpected docker $*" >&2; exit 2 ;;
esac
"""

CURL_STUB = r'''#!/usr/bin/env bash
# curl -fsS -m 10 -H 'Content-Type: application/json' -d '<json>' <url>  -> capture the payload
echo "curl $*" >> "$STUB_HOME/calls.log"
while [ $# -gt 0 ]; do
  if [ "$1" = "-d" ]; then printf '%s' "$2" > "$STUB_HOME/curl-payload.json"; shift; fi
  shift
done
'''

GSUTIL_STUB = r'''#!/usr/bin/env bash
# fake bucket = directory $STUB_BUCKET_DIR; gs://<bucket>/<path> -> $STUB_BUCKET_DIR/<path>
echo "gsutil $*" >> "$STUB_HOME/calls.log"
to_path() { local u="$1"; u="${u#gs://}"; u="${u#*/}"; printf '%s/%s' "$STUB_BUCKET_DIR" "$u"; }
case "$1" in
  cp)
    if [ "$2" = "-" ]; then
      # upload: gsutil cp - gs://bucket/dir/name
      p="$(to_path "$3")"; mkdir -p "$(dirname "$p")"; cat > "$p"
    else
      # download: gsutil cp gs://bucket/dir/name -
      p="$(to_path "$2")"; [ -f "$p" ] || { echo "No URLs matched: $2" >&2; exit 1; }; cat "$p"
    fi ;;
  stat)
    p="$(to_path "$2")"; [ -f "$p" ] || { echo "No URLs matched: $2" >&2; exit 1; }
    printf '%s:\n    Content-Length:          %s\n' "$2" "$(wc -c < "$p" | tr -d ' ')" ;;
  ls)
    # gsutil ls gs://bucket/dir/   -> one url per line
    p="$(to_path "${@: -1}")"; [ -d "$p" ] || { echo "CommandException: One or more URLs matched no objects." >&2; exit 1; }
    for f in "$p"/*; do [ -f "$f" ] && printf '%s%s\n' "${@: -1}" "$(basename "$f")"; done ;;
  rm)
    if [ -n "${STUB_RM_FAILS:-}" ]; then echo "AccessDeniedException: 403" >&2; exit 1; fi
    p="$(to_path "$2")"; rm -f "$p" ;;
  *) echo "unexpected gsutil $*" >&2; exit 2 ;;
esac
'''


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
    bucket_dir = tmp_path / "bucket"
    bucket_dir.mkdir()
    env = {
        **os.environ,
        "PATH": f"{bin_dir}:{os.environ['PATH']}",
        "HOME": str(home),
        "STUB_HOME": str(home),
        "STUB_BUCKET_DIR": str(bucket_dir),
        "BACKUP_BUCKET": "gs://unit-test-bucket",
        "BACKUP_RETENTION_DAYS": "14",
        "BACKUP_DATABASES": "padel_app padel_app_staging",
    }
    env.pop("DISCORD_WEBHOOK_URL", None)
    return {"env": env, "home": home, "bucket": bucket_dir}


def run(sandbox, *args, **env_overrides):
    env = {**sandbox["env"], **env_overrides}
    for k, v in list(env_overrides.items()):
        if v is None:
            env.pop(k, None)
    return subprocess.run(["bash", str(SCRIPT), *args], env=env, capture_output=True, text=True, timeout=60)


def test_dumps_both_databases_inside_the_container_and_uploads_them(sandbox):
    result = run(sandbox)
    assert result.returncode == 0, result.stdout + result.stderr

    calls = (sandbox["home"] / "calls.log").read_text()
    for db in ("padel_app", "padel_app_staging"):
        assert f"docker exec postgres pg_dump -U padel_app_user -Fc {db}" in calls
        objects = sorted((sandbox["bucket"] / db).glob(f"{db}-*.dump"))
        assert len(objects) == 1, list(sandbox["bucket"].rglob("*"))
        assert objects[0].read_bytes() == f"PGDMP-{db}-payload".encode()
    assert "pg_dump -h" not in calls, "the dump must run inside the container, never on the host"

    status = (sandbox["home"] / "backup.status").read_text()
    assert status.startswith("ok ")
    assert "BACKUP OK padel_app " in result.stdout
    assert "BACKUP OK padel_app_staging " in result.stdout


def test_a_failing_dump_exits_non_zero_says_so_and_leaves_no_partial_object(sandbox):
    result = run(sandbox, STUB_PG_DUMP_FAILS="1")
    assert result.returncode != 0
    assert "BACKUP FAILED" in result.stdout + result.stderr
    assert (sandbox["home"] / "backup.status").read_text().startswith("failed ")
    assert list(sandbox["bucket"].rglob("*.dump")) == []


def test_an_unset_bucket_is_a_failure_not_a_skip(sandbox):
    result = run(sandbox, BACKUP_BUCKET=None)
    assert result.returncode != 0
    assert "BACKUP_BUCKET" in result.stdout + result.stderr
    assert (sandbox["home"] / "calls.log").exists() is False or "pg_dump" not in (sandbox["home"] / "calls.log").read_text()


def test_prunes_dumps_older_than_the_retention_and_keeps_recent_ones(sandbox):
    old = sandbox["bucket"] / "padel_app" / "padel_app-2020-01-01_0300.dump"
    recent_name = "padel_app-2999-01-01_0300.dump"
    old.parent.mkdir(parents=True)
    old.write_text("old")
    (old.parent / recent_name).write_text("recent")

    result = run(sandbox)
    assert result.returncode == 0, result.stdout + result.stderr
    assert not old.exists(), "a dump older than the retention must be removed"
    assert (old.parent / recent_name).exists()
    assert "gsutil rm gs://unit-test-bucket/padel_app/padel_app-2020-01-01_0300.dump" in (sandbox["home"] / "calls.log").read_text()


# --- restore-check (B-091: this path had never been run until the coordinator ran it on the
# --- VM on 2026-09-16 and it died on `local db=… scratch="${db}_…"` under `set -u`) -----------

def seed_dumps(sandbox, *names, db="padel_app"):
    folder = sandbox["bucket"] / db
    folder.mkdir(parents=True, exist_ok=True)
    for name in names:
        (folder / name).write_text(f"PGDMP-{name}")


def test_restore_check_restores_the_latest_dump_into_a_scratch_database_and_drops_it(sandbox):
    seed_dumps(sandbox, "padel_app-2026-09-15_1751.dump", "padel_app-2026-09-16_0944.dump")

    result = run(sandbox, "restore-check")
    assert result.returncode == 0, result.stdout + result.stderr

    calls = (sandbox["home"] / "calls.log").read_text().splitlines()
    psql = "docker exec postgres psql -U padel_app_user -d postgres -Atc "
    assert psql + "DROP DATABASE IF EXISTS padel_app_restore_check" in calls
    assert psql + "CREATE DATABASE padel_app_restore_check" in calls
    assert "gsutil cp gs://unit-test-bucket/padel_app/padel_app-2026-09-16_0944.dump -" in calls, "must restore the NEWEST dump"
    assert (
        "docker exec -i postgres pg_restore -U padel_app_user -d padel_app_restore_check --no-owner --no-privileges" in calls
    )
    assert (sandbox["home"] / "restored.dump").read_text() == "PGDMP-padel_app-2026-09-16_0944.dump", "the restore must be fed the dump's bytes"
    assert "docker exec postgres psql -U padel_app_user -d padel_app_restore_check -Atc select count(*) from users" in calls
    assert calls[-1] == psql + "DROP DATABASE IF EXISTS padel_app_restore_check", "the scratch database must not outlive the check"
    assert "RESTORE CHECK OK gs://unit-test-bucket/padel_app/padel_app-2026-09-16_0944.dump users=185" in result.stdout
    assert not (sandbox["home"] / "backup.status").exists(), "a restore check is not a backup and must not write the status file"


def test_restore_check_with_no_dump_in_the_bucket_fails_and_says_so(sandbox):
    result = run(sandbox, "restore-check")
    assert result.returncode != 0
    assert "restore-check: no dump found under gs://unit-test-bucket/padel_app/" in result.stdout + result.stderr
    assert "unbound variable" not in result.stderr
    assert "unexpected error" not in result.stdout + result.stderr


def test_restore_check_that_cannot_restore_fails_and_drops_the_scratch_database(sandbox):
    seed_dumps(sandbox, "padel_app-2026-09-16_0944.dump")
    result = run(sandbox, "restore-check", STUB_PG_RESTORE_FAILS="1")
    assert result.returncode != 0
    assert "BACKUP FAILED restore-check: pg_restore of gs://unit-test-bucket/padel_app/padel_app-2026-09-16_0944.dump failed" in result.stdout
    calls = (sandbox["home"] / "calls.log").read_text().splitlines()
    assert calls[-1].endswith("DROP DATABASE IF EXISTS padel_app_restore_check")


def test_restore_check_with_an_empty_users_table_fails(sandbox):
    seed_dumps(sandbox, "padel_app-2026-09-16_0944.dump")
    result = run(sandbox, "restore-check", STUB_USERS="0")
    assert result.returncode != 0
    assert "restore-check: restored database has no users" in result.stdout


def test_restore_check_of_the_staging_database_uses_its_own_scratch_name(sandbox):
    seed_dumps(sandbox, "padel_app_staging-2026-09-16_0944.dump", db="padel_app_staging")
    result = run(sandbox, "restore-check", "padel_app_staging")
    assert result.returncode == 0, result.stdout + result.stderr
    calls = (sandbox["home"] / "calls.log").read_text()
    assert "-d padel_app_staging_restore_check --no-owner" in calls


# --- other paths that had never run (B-091) ---------------------------------------------------

def test_a_failed_prune_is_logged_and_does_not_fail_the_backup(sandbox):
    old = sandbox["bucket"] / "padel_app" / "padel_app-2020-01-01_0300.dump"
    old.parent.mkdir(parents=True)
    old.write_text("old")
    result = run(sandbox, STUB_RM_FAILS="1")
    assert result.returncode == 0, result.stdout + result.stderr
    assert "PRUNE FAILED gs://unit-test-bucket/padel_app/padel_app-2020-01-01_0300.dump" in result.stdout
    assert "BACKUP COMPLETE" in result.stdout
    assert (sandbox["home"] / "backup.status").read_text().startswith("ok ")


def test_the_discord_notification_is_valid_json_even_when_the_message_has_quotes(sandbox):
    import json
    result = run(sandbox, BACKUP_BUCKET='not-a-bucket"with-quote\\', DISCORD_WEBHOOK_URL="https://discord.invalid/hook")
    assert result.returncode != 0
    payload = (sandbox["home"] / "curl-payload.json").read_text()
    body = json.loads(payload)  # a bad payload is a notification Discord rejects and curl swallows
    assert body["content"].startswith("levapp backup (")
    assert 'BACKUP FAILED BACKUP_BUCKET must be a gs:// url' in body["content"]
