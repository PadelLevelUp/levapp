"""PAD-296 / B-080 — ``backend/scripts/backup.sh`` (compass R-028).

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

DOCKER_STUB = r'''#!/usr/bin/env bash
# docker exec <container> pg_dump -U <user> -Fc <db>   |  docker exec -i <container> ...
echo "docker $*" >> "$STUB_HOME/calls.log"
if [ -n "${STUB_PG_DUMP_FAILS:-}" ] && [ "$*" != "${*/pg_dump/}" ]; then
  echo "pg_dump: error: connection refused" >&2
  exit 1
fi
db="${@: -1}"
printf 'PGDMP-%s-payload' "$db"
'''

GSUTIL_STUB = r'''#!/usr/bin/env bash
# fake bucket = directory $STUB_BUCKET_DIR; gs://<bucket>/<path> -> $STUB_BUCKET_DIR/<path>
echo "gsutil $*" >> "$STUB_HOME/calls.log"
to_path() { local u="$1"; u="${u#gs://}"; u="${u#*/}"; printf '%s/%s' "$STUB_BUCKET_DIR" "$u"; }
case "$1" in
  cp)
    # gsutil cp - gs://bucket/dir/name
    p="$(to_path "$3")"; mkdir -p "$(dirname "$p")"; cat > "$p" ;;
  stat)
    p="$(to_path "$2")"; [ -f "$p" ] || { echo "No URLs matched: $2" >&2; exit 1; }
    printf '%s:\n    Content-Length:          %s\n' "$2" "$(wc -c < "$p" | tr -d ' ')" ;;
  ls)
    # gsutil ls gs://bucket/dir/   -> one url per line
    p="$(to_path "${@: -1}")"; [ -d "$p" ] || exit 0
    for f in "$p"/*; do [ -f "$f" ] && printf '%s%s\n' "${@: -1}" "$(basename "$f")"; done ;;
  rm)
    p="$(to_path "$2")"; rm -f "$p" ;;
  *) echo "unexpected gsutil $*" >&2; exit 2 ;;
esac
'''


@pytest.fixture
def sandbox(tmp_path):
    bin_dir = tmp_path / "bin"
    bin_dir.mkdir()
    for name, body in (("docker", DOCKER_STUB), ("gsutil", GSUTIL_STUB)):
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
