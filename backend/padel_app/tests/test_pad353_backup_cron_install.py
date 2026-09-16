"""PAD-353 / B-090 — ``backend/scripts/install_backup_cron.sh`` (compass R-028).

The deploy's cron step wiped the production crontab instead of installing the
nightly backup, and reported success. Both halves are tested here: the install
is idempotent from either starting state, and an install that does not take
fails the step.

A stub ``crontab`` on PATH stands in for the real one, backed by a file, so the
test needs no cron and no VM — the same shape as ``test_backup_script.py``'s
stub ``docker`` and ``gsutil``.
"""
import os
import stat
import subprocess
from pathlib import Path

import pytest

SCRIPT = Path(__file__).resolve().parents[2] / "scripts" / "install_backup_cron.sh"

CRONTAB_STUB = r'''#!/usr/bin/env bash
# crontab -l  -> print the table (exit 1 when there is none, as the real one does)
# crontab -   -> replace the table from stdin
f="$STUB_HOME/crontab.txt"
echo "crontab $*" >> "$STUB_HOME/calls.log"
case "${1:-}" in
  -l) [ -f "$f" ] || { echo "no crontab for stub" >&2; exit 1; }; cat "$f" ;;
  -)  if [ -n "${STUB_CRONTAB_SWALLOWS:-}" ]; then cat > /dev/null; else cat > "$f"; fi ;;
  -r) rm -f "$f" ;;
  *)  echo "unexpected crontab $*" >&2; exit 2 ;;
esac
'''

OLD_ONE_LINER = (
    '(crontab -l 2>/dev/null | grep -v backup.sh; '
    'echo "0 3 * * * $HOME/backup.sh >> $HOME/backup.log 2>&1") | crontab -'
)


@pytest.fixture
def sandbox(tmp_path):
    bin_dir = tmp_path / "bin"
    bin_dir.mkdir()
    stub = bin_dir / "crontab"
    stub.write_text(CRONTAB_STUB)
    stub.chmod(stub.stat().st_mode | stat.S_IEXEC)
    home = tmp_path / "home"
    home.mkdir()
    env = {
        **os.environ,
        "PATH": f"{bin_dir}:{os.environ['PATH']}",
        "HOME": str(home),
        "STUB_HOME": str(home),
    }

    class Sandbox:
        table = home / "crontab.txt"

        def set_crontab(self, text):
            self.table.write_text(text)

        def crontab(self):
            return self.table.read_text() if self.table.exists() else ""

        def backup_lines(self):
            return [l for l in self.crontab().splitlines() if "backup.sh" in l]

        def run(self, **extra):
            return subprocess.run(
                ["bash", str(SCRIPT)], env={**env, **extra},
                capture_output=True, text=True,
            )

        def run_old_one_liner(self):
            return subprocess.run(
                ["bash", "-c", "set -euo pipefail\n" + OLD_ONE_LINER],
                env=env, capture_output=True, text=True,
            )

    return Sandbox()


def test_a_vm_with_no_crontab_ends_with_exactly_one_backup_line(sandbox):
    """The fresh-VM starting state: `crontab -l` exits 1 and that is normal."""
    result = sandbox.run()
    assert result.returncode == 0, result.stderr
    assert len(sandbox.backup_lines()) == 1, sandbox.crontab()
    assert sandbox.backup_lines()[0].startswith("0 3 * * * ")


def test_the_line_is_not_duplicated_when_it_is_already_installed(sandbox):
    """The other starting state, and the one that broke production: a crontab
    holding nothing but the backup line."""
    sandbox.run()
    first = sandbox.crontab()

    result = sandbox.run()

    assert result.returncode == 0, result.stderr
    assert sandbox.crontab() == first, "a second deploy changed the crontab"
    assert len(sandbox.backup_lines()) == 1


def test_an_old_backup_line_is_replaced_and_unrelated_jobs_survive(sandbox):
    sandbox.set_crontab(
        "# m h dom mon dow command\n"
        "@reboot /home/x/startup.sh\n"
        "30 2 * * * /home/x/backup.sh --old-flags >> /home/x/old.log 2>&1\n"
        "*/5 * * * * /home/x/heartbeat.sh\n"
    )

    result = sandbox.run()

    assert result.returncode == 0, result.stderr
    assert len(sandbox.backup_lines()) == 1, sandbox.crontab()
    assert "--old-flags" not in sandbox.crontab()
    assert "@reboot /home/x/startup.sh" in sandbox.crontab()
    assert "*/5 * * * * /home/x/heartbeat.sh" in sandbox.crontab()


def test_an_install_that_does_not_take_fails_the_step(sandbox):
    """The heart of PAD-353: the old step could not fail. This one reads the
    crontab back, so an install that silently does nothing is a red deploy."""
    result = sandbox.run(STUB_CRONTAB_SWALLOWS="1")

    assert result.returncode != 0
    assert "::error::" in result.stderr
    assert sandbox.backup_lines() == []


def test_the_old_one_liner_wiped_the_crontab_premise_pinned(sandbox):
    """What actually happened on 2026-09-16, pinned: if this ever stops being
    true, the fix above is answering a question nobody is asking."""
    sandbox.set_crontab("0 3 * * * /home/x/backup.sh >> /home/x/backup.log 2>&1\n")

    result = sandbox.run_old_one_liner()

    assert result.returncode != 0, "grep -v matching nothing exits 1 under set -e"
    assert sandbox.backup_lines() == [], (
        "the subshell died before the echo, so `crontab -` got an empty document"
    )
