"""Guard: the tracked knowledge layer publishes no operational identifiers (PAD-344, R-036).

The repository is public. Conventions, rules, decisions and the bug ledger belong in the
tracked `.cortex/` and `.specflow/` trees; the operator's map of production does not — the
VM's name, the GCP project (bucket names carry it as a prefix), the zone, the addresses and
the SSH commands that combine them live in the local, gitignored `docs/infra/environment.md`.

The identifiers are kept here as SHA-256 digests of their lower-cased text, so this file is
not itself the map it guards against. To add one:

    python3 -c 'import hashlib,sys; print(hashlib.sha256(sys.argv[1].lower().encode()).hexdigest())' '<identifier>'

`.cortex/insight/` is excluded on purpose: it is regenerated from the code, and the code
(Terraform, workflows, config) names what it needs; scrubbing a mirror of it would be undone
by the next `cortex insight` run. Root-level Markdown is included.
"""

import hashlib
import re
import subprocess
from pathlib import Path

from padel_app.tests.git_env import git_env

REPO_ROOT = Path(__file__).resolve().parents[3]

# Pathspecs, from the repository root. `:(glob)*.md` is root-level Markdown only.
GUARDED_PATHSPECS = (".cortex", ".specflow", ".claude", ":(glob)*.md")
EXCLUDED_PREFIXES = (".cortex/insight/",)

IDENTIFIER_DIGESTS = frozenset(
    {
        "323eebe34f51f904acd620583439932ce3091e97b0aa574f6c64f6859932c717",
        "7bc3b50bac22213ba2fdef9e86ad97a12978e8542b2faf0ed1989a94add18355",
        "86c47bbe9302fec0f468a543fe32b539ef116c158c12720196293ab1e41494c8",
        "8d89f211c9df690c3413e8341e85f9a0032e295fc5c74af44c8a51b133ecf696",
        "ae3b612b95364fe85e84c6e7a4554ccaef948fb77eb1a3f37e4e6c125afd6ede",
        "e14c3b30cfec8f5cac9b4de28d011d7de0f7881c9eb4ffae579d5e37f0525107",
    }
)

# A dotted-quad address, or a hyphenated name and each of its hyphen-delimited prefixes
# (`<project>-backups` must trip on `<project>`).
IPV4 = re.compile(r"\b\d{1,3}(?:\.\d{1,3}){3}\b")
HYPHENATED = re.compile(r"[a-z0-9]+(?:-[a-z0-9]+)+")


def _digest(token):
    return hashlib.sha256(token.encode()).hexdigest()


def candidate_tokens(text):
    text = text.lower()
    for match in IPV4.finditer(text):
        yield match.group(0)
    for match in HYPHENATED.finditer(text):
        parts = match.group(0).split("-")
        for end in range(2, len(parts) + 1):
            yield "-".join(parts[:end])


def find_identifiers(text, digests=IDENTIFIER_DIGESTS):
    """The distinct guarded identifiers present in ``text``, as the tokens found."""
    return sorted({token for token in candidate_tokens(text) if _digest(token) in digests})


def tracked_knowledge_files():
    out = subprocess.run(
        ["git", "ls-files", "-z", "--", *GUARDED_PATHSPECS],
        cwd=REPO_ROOT,
        capture_output=True,
        check=True,
        env=git_env(),
    ).stdout.decode()
    paths = [p for p in out.split("\0") if p]
    return [p for p in paths if not p.startswith(EXCLUDED_PREFIXES)]


def test_scanner_finds_a_planted_identifier():
    """R-034: the guard is seen catching what it exists to catch, without a real identifier."""
    digests = frozenset({_digest("planted-guard-token"), _digest("203.0.113.9")})
    text = "ssh into planted-guard-token-backups at 203.0.113.9 (and Planted-Guard-Token again)"
    assert find_identifiers(text, digests) == ["203.0.113.9", "planted-guard-token"]
    assert find_identifiers("nothing here: 2026-09-16, levapp.app, 127.0.0.1", digests) == []


def test_guard_scans_the_knowledge_layer():
    """R-032: a guard that finds nothing to scan must fail, not pass vacuously."""
    files = tracked_knowledge_files()
    assert ".cortex/compass/environment.md" in files
    assert any(p.startswith(".specflow/") for p in files)
    assert any(p.startswith(".claude/") for p in files)
    assert not any(p.startswith(".cortex/insight/") for p in files)


def test_tracked_knowledge_layer_publishes_no_operational_identifiers():
    hits = []
    for path in tracked_knowledge_files():
        try:
            lines = (REPO_ROOT / path).read_text(encoding="utf-8", errors="ignore").splitlines()
        except (OSError, IsADirectoryError):
            continue
        for number, line in enumerate(lines, start=1):
            found = find_identifiers(line)
            if found:
                hits.append(f"{path}:{number}: {', '.join(found)}")
    assert not hits, (
        "Operational identifiers in the tracked knowledge layer (PAD-344, R-036). Move them to "
        "the local docs/infra/environment.md and refer to them by role or variable:\n  "
        + "\n  ".join(hits)
    )
