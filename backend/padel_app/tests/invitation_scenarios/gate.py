"""The engine wave's gate as one number (PAD-899 brief §1): for a git ref, every scenario's outcome
against the `new` engine, the error count, and the `today` baseline-mode result line.

usage (from backend/, with the venv):
    .venv/bin/python -I padel_app/tests/invitation_scenarios/gate.py [REF] [--no-today]

REF defaults to the working tree. A REF other than the working tree is checked out detached in a
temporary worktree under ~/worktrees/levapp/, which is removed afterwards. The `today` baseline run
is the heavy part (about 3-5 minutes on SQLite); `--no-today` skips it. The output is plain text to
paste into the coordinator's log.
"""
from __future__ import annotations

import os
import re
import subprocess
import sys
import tempfile
from pathlib import Path

import yaml

HERE = Path(__file__).resolve().parent
BACKEND = HERE.parents[2]
REPO = BACKEND.parent
SUITE = "padel_app/tests/invitation_scenarios"


def _git(*args: str, cwd: Path = REPO) -> str:
    return subprocess.run(["git", *args], cwd=cwd, check=True, capture_output=True, text=True).stdout.strip()


def _pytest(backend: Path, env: dict[str, str]) -> tuple[str, int]:
    """Run the scenario tests in ``backend`` with ``env``; return pytest's last line and exit code."""
    cmd = [str(backend / ".venv/bin/python"), "-m", "pytest", SUITE, "-k", "test_scenario", "-q",
           "-p", "no:cacheprovider"]
    run = subprocess.run(cmd, cwd=backend, env={**os.environ, "POSTGRES_PORT": "5432", **env},
                         capture_output=True, text=True)
    lines = [ln for ln in run.stdout.splitlines() if ln.strip()]
    return (lines[-1] if lines else run.stderr.strip()[-300:]), run.returncode


def _ids(backend: Path) -> list[str]:
    return sorted(p.stem for p in (backend / SUITE / "scenarios").glob("*.yaml"))


def measure(backend: Path, today: bool) -> str:
    out: list[str] = []
    with tempfile.TemporaryDirectory() as logs:
        line, _ = _pytest(backend, {"INVITATION_ENGINE": "new", "INVITATION_SCENARIOS": "1",
                                    "INVITATION_SCENARIOS_OUT": logs})
        by: dict[str, list[str]] = {"pass": [], "fail": [], "error": []}
        seen = set()
        for log in Path(logs).glob("*.log.yaml"):
            d = yaml.safe_load(log.read_text(encoding="utf-8"))
            key = "error" if d.get("error") else d["outcome"]
            by.setdefault(key, []).append(d["scenario"])
            seen.add(d["scenario"])
    ids = _ids(backend)
    missing = [i for i in ids if i not in seen]
    short = lambda names: " ".join(sorted(re.match(r"^(P?\d+[ab]?)-", n).group(1) for n in names))  # noqa: E731
    out.append(f"new: {len(by['pass'])} pass, {len(by['fail'])} fail, {len(by['error'])} error, "
               f"{len(missing)} not run, of {len(ids)} files")
    out.append(f"  pytest: {line} (its count includes the always-on tests of test_scenarios.py)")
    for key in ("pass", "error", "fail"):
        if by[key]:
            out.append(f"  {key}: {short(by[key])}")
    if missing:
        out.append(f"  not run: {short(missing)}")
    if today:
        line, code = _pytest(backend, {"INVITATION_SCENARIOS": "baseline"})
        out.append(f"today baseline mode: {line} (exit {code})")
    else:
        out.append("today baseline mode: skipped (--no-today)")
    return "\n".join(out)


def main(argv: list[str]) -> int:
    today = "--no-today" not in argv
    refs = [a for a in argv if not a.startswith("--")]
    if not refs:
        head = _git("rev-parse", "--short", "HEAD")
        dirty = " + uncommitted changes" if _git("status", "--porcelain") else ""
        print(f"gate: working tree at {head}{dirty}")
        print(measure(BACKEND, today))
        return 0
    ref = refs[0]
    sha = _git("rev-parse", "--short", ref)
    tree = Path.home() / "worktrees" / "levapp" / f"gate-{sha}"
    _git("worktree", "add", "--detach", str(tree), sha)
    try:
        (tree / "backend/.venv").symlink_to(BACKEND / ".venv")
        print(f"gate: {ref} = {sha} ({_git('log', '-1', '--format=%cI %s', sha)})")
        print(measure(tree / "backend", today))
    finally:
        _git("worktree", "remove", "--force", str(tree))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
