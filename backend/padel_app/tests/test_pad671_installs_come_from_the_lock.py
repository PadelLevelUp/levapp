"""Every backend install comes from poetry.lock (PAD-671, delivery.backend-ci-lanes rule 6).

On 2026-10-14 py-vapid 1.9.5 shipped a broken sdist. For ~30 minutes, every CI job that ran
`pip install .` failed at install, and so would the deploy image (`backend/Dockerfile`). Those
installs resolved from pyproject's ranges while poetry.lock pinned 1.9.4.

Now each install site installs a hashed export of the lock first, then the package with
`--no-deps`. This pins three things, read as text like test_backend_ci_timeouts:
- no site goes back to resolving from ranges;
- the exports name exactly the lock's packages, versions and hashes;
- the guard found the sites it guards (R-032).
"""
import pathlib
import re
import shlex

try:
    import tomllib
except ImportError:  # Python 3.10 (CI): pytest depends on tomli there
    import tomli as tomllib

ROOT = pathlib.Path(__file__).resolve().parents[3]
BACKEND = ROOT / "backend"
SITES = sorted((ROOT / ".github" / "workflows").glob("*.yaml")) + [BACKEND / "Dockerfile"]
EXPECTED_SITES = 7  # backend-tests x3, e2e-subset, admin-e2e, android-build, Dockerfile

# `pip install`, `pip3 install`, `python -m pip install`, `uv pip install`.
PIP_INSTALL = re.compile(r"(?:^|[\s/])(?:python[\d.]*\s+-m\s+)?(?:uv\s+)?pip3?\s+install\b(.*)$")
# The backend package as a target: `.` (backend-tests runs in backend/, the Dockerfile in its
# copy), or a path ending in `backend`, with optional extras.
BACKEND_TOKEN = re.compile(r"^(?:\.|(?:\.{1,2}/)?(?:[\w.-]+/)*backend/?)(?:\[[^\]]*\])?$")
HASHED_EXPORT = re.compile(r"--require-hashes\s+-r\s+\S*requirements(?:-dev)?\.txt")


def _statements(path):
    """(first line number, statement) for every shell statement, continuations joined."""
    out = []
    pending, start = "", None
    for number, line in enumerate(path.read_text().splitlines(), 1):
        if start is None:
            start = number
        if line.rstrip().endswith("\\"):
            pending += line.rstrip()[:-1] + " "
            continue
        for part in re.split(r"&&|\|\||;", pending + line):
            out.append((start, part))
        pending, start = "", None
    return out


def _installs_backend(statement):
    match = PIP_INSTALL.search(statement)
    if not match:
        return False
    try:
        tokens = shlex.split(match.group(1), comments=True)
    except ValueError:
        tokens = match.group(1).split()
    return any(BACKEND_TOKEN.match(t) for t in tokens if not t.startswith("-"))


def _backend_installs():
    return [
        (path, number, statement)
        for path in SITES
        for number, statement in _statements(path)
        if _installs_backend(statement)
    ]


def _normalise(name):
    return re.sub(r"[-_.]+", "-", name).lower()


def _requirements(path):
    """name -> (version, set of sha256) from a hashed `poetry export`."""
    out = {}
    for block in re.split(r"\n(?=[A-Za-z0-9])", path.read_text().strip()):
        head = re.match(r"([A-Za-z0-9_.\-]+)==(\S+)", block)
        if head:
            out[_normalise(head.group(1))] = (head.group(2), set(re.findall(r"sha256:([0-9a-f]{64})", block)))
    return out


def _lock(groups):
    lock = tomllib.loads((BACKEND / "poetry.lock").read_text())
    return {
        _normalise(p["name"]): (p["version"], {f["hash"].split(":", 1)[1] for f in p.get("files", [])})
        for p in lock["package"]
        if groups is None or set(p.get("groups", [])) & groups
    }


def test_the_guard_found_every_backend_install_site():
    assert len(_backend_installs()) == EXPECTED_SITES, [
        f"{p.relative_to(ROOT)}:{n}" for p, n, _ in _backend_installs()
    ]


def test_the_scanner_sees_the_forms_a_bare_install_could_take():
    for bare in [
        "pip install .",
        "pip3 install .",
        "pip install '.'",
        'pip install "./backend"',
        "pip install .[dev]",
        "pip install backend/",
        "pip install ../backend",
        "python -m pip install -e .",
        "uv pip install ./app/backend",
        "RUN pip install --prefix=/install .",
    ]:
        assert _installs_backend(bare), bare
    for other in ["pip install --upgrade pip setuptools wheel", "pip install --require-hashes -r requirements.txt"]:
        assert not _installs_backend(other), other


def test_a_continued_or_chained_bare_install_is_seen(tmp_path):
    workflow = tmp_path / "w.yaml"
    workflow.write_text("run: |\n  pip install --no-deps x && pip install .\n  pip install \\\n    --quiet \\\n    ./backend\n")
    statements = [(n, s) for n, s in _statements(workflow) if _installs_backend(s)]
    assert [(n, "--no-deps" in s) for n, s in statements] == [(2, False), (3, False)]


def test_no_backend_install_resolves_from_pyproject_ranges():
    offenders = [
        f"{p.relative_to(ROOT)}:{n}: {s.strip()}"
        for p, n, s in _backend_installs()
        if "--no-deps" not in s
    ]
    assert offenders == [], "install the backend with --no-deps after the hashed lock export"


def test_each_install_site_installs_the_hashed_lock_export_first():
    missing = []
    for path in SITES:
        sites = sorted(n for p, n, _ in _backend_installs() if p == path)
        lines = path.read_text().splitlines()
        previous = 0
        for number in sites:
            # Between the previous backend install (or the file's start) and this one: each
            # site needs its own hashed install, not one borrowed from another job.
            if not HASHED_EXPORT.search("\n".join(lines[previous:number])):
                missing.append(f"{path.relative_to(ROOT)}:{number}")
            previous = number
    assert missing == []


def test_the_main_export_is_the_locks_main_group():
    exported = _requirements(BACKEND / "requirements.txt")
    assert len(exported) > 50
    assert exported == _lock({"main"})
    assert exported["py-vapid"][0] == "1.9.4"


def test_the_dev_export_is_the_whole_lock():
    exported = _requirements(BACKEND / "requirements-dev.txt")
    assert exported == _lock(None)
    assert "pytest-split" in exported


def test_every_exported_requirement_carries_a_hash():
    for name in ("requirements.txt", "requirements-dev.txt"):
        unhashed = [n for n, (_, hashes) in _requirements(BACKEND / name).items() if not hashes]
        assert unhashed == [], name
