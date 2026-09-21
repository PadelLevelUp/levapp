"""B-127 — a test file no runner collects is a test nobody runs.

`frontend/apps/web/e2e/scripts/test_seed_dates.py` (PAD-223: the E2E seed's dates
never collide, whatever weekday the suite runs on) was collected by no lane: CI ran
`python -m pytest padel_app/tests`, and that file lives elsewhere, run only by hand
("Run from the backend venv", its own docstring says). Its frontend twin was
`packages/hooks/src/useCalendarEvents.test.tsx`, PAD-348's regression test, which no
vitest config listed (guard: frontend/packages/config/src/every-test-file-is-collected.test.ts).

One instrument, not two. What "collected" means is read from the runner, not from
a second list kept here:

- the paths come from the `python -m pytest …` lines of
  `.github/workflows/backend-tests.yaml` — what CI really invokes;
- the file-name patterns come from pytest's own `python_files` setting;
- and when this session IS that full invocation, from the session's own items.

Only the candidate side is a pattern, deliberately wider than any runner's: every
Python file in the repository that defines a test.
"""
import fnmatch
import re
import subprocess
from pathlib import Path

import pytest

REPO = Path(__file__).resolve().parents[3]
BACKEND = REPO / "backend"
WORKFLOW = REPO / ".github" / "workflows" / "backend-tests.yaml"

DEFINES_A_TEST = re.compile(r"^\s*(?:async\s+)?def test_\w*\(|^class Test\w*[(:]", re.MULTILINE)
#: pytest options that take a value, so the value is not mistaken for a path.
OPTIONS_WITH_A_VALUE = {"-p", "-k", "-m", "-o", "-c", "-n", "-W", "--rootdir", "--deselect", "--ignore"}


def ci_pytest_commands() -> list[str]:
    """Every `python -m pytest …` command line in the backend workflow."""
    commands = []
    for line in WORKFLOW.read_text(encoding="utf-8").splitlines():
        stripped = line.strip().removeprefix("- ")
        if stripped.startswith("run:") and "python -m pytest" in stripped:
            commands.append(stripped.removeprefix("run:").strip())
    return commands


def ci_roots(command: str) -> list[Path]:
    """The paths a CI command hands to pytest, resolved from its working directory."""
    tokens = command.split()
    tokens = tokens[tokens.index("pytest") + 1:]
    roots, skip = [], False
    for token in tokens:
        if skip:
            skip = False
        elif token in OPTIONS_WITH_A_VALUE:
            skip = True
        elif not token.startswith("-"):
            roots.append((BACKEND / token).resolve())
    return roots


def files_defining_tests() -> list[Path]:
    """Every Python file git knows or would add (tracked + untracked, minus ignored)
    that defines a test function or class."""
    listed = subprocess.run(
        ["git", "ls-files", "--cached", "--others", "--exclude-standard", "--", "*.py"],
        cwd=REPO, check=True, capture_output=True, text=True,
    ).stdout.splitlines()
    found = []
    for name in listed:
        path = REPO / name
        if path.is_file() and DEFINES_A_TEST.search(path.read_text(encoding="utf-8", errors="replace")):
            found.append(path.resolve())
    return found


def _under(path: Path, roots) -> bool:
    return any(root == path or root in path.parents for root in roots)


def test_the_workflow_still_says_what_this_guard_reads():
    """The instrument itself: if the workflow stops looking like this, fail loudly
    rather than guard nothing."""
    text = WORKFLOW.read_text(encoding="utf-8")
    assert "working-directory: backend" in text, "ci_roots() resolves paths from backend/"
    commands = ci_pytest_commands()
    assert len(commands) >= 2, f"expected a pytest line per lane (sqlite, postgres), found {commands}"
    roots = [sorted(map(str, ci_roots(c))) for c in commands]
    assert all(r == roots[0] for r in roots), f"the lanes do not run the same paths: {roots}"
    assert all(Path(r).exists() for r in roots[0]), f"a CI path does not exist: {roots[0]}"


def test_every_file_that_defines_a_test_is_where_ci_looks_and_named_as_pytest_expects(request):
    roots = ci_roots(ci_pytest_commands()[0])
    patterns = request.config.getini("python_files")  # pytest's own: test_*.py, *_test.py
    candidates = files_defining_tests()
    assert candidates, "found no test files at all — the candidate search is broken"

    outside = sorted(str(p.relative_to(REPO)) for p in candidates if not _under(p, roots))
    assert outside == [], (
        "these files define tests but CI's pytest command never looks there "
        f"(add the path to every pytest line in {WORKFLOW.relative_to(REPO)}): {outside}"
    )
    misnamed = sorted(
        str(p.relative_to(REPO)) for p in candidates if not any(fnmatch.fnmatch(p.name, pat) for pat in patterns)
    )
    assert misnamed == [], f"these files define tests but do not match python_files={patterns}: {misnamed}"


def test_a_full_session_collected_every_file_that_defines_a_test(request):
    """The runner's own listing. Only meaningful when this session is CI's invocation:
    a single-file run has, rightly, collected one file."""
    roots = ci_roots(ci_pytest_commands()[0])
    invoked = [Path(str(arg).split("::")[0]).resolve() for arg in request.config.args]
    if not all(_under(root, invoked) for root in roots):
        pytest.skip("partial session: not the full CI invocation")
    collected = {Path(str(item.path)).resolve() for item in request.session.items}
    missing = sorted(str(p.relative_to(REPO)) for p in files_defining_tests() if p not in collected)
    assert missing == [], f"defined tests, collected none of them: {missing}"
