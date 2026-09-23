"""PAD-384 (B-144): no backend module defines the same top-level function or class twice.

`lesson_service.py` carried a whole second copy of `coaches_for`, `primary_coach` and
`coach_instance_ids` (PAD-275 landed twice through a merge). Python keeps the later one, so the
next person to edit the earlier copy changes nothing and nothing fails. flake8's F811 would say
so, but flake8 is not run in CI; this scan is, and it names every offender.
"""
import ast
import collections
from pathlib import Path

PACKAGE = Path(__file__).resolve().parents[1]


def _redefinitions(source: str) -> dict:
    seen = collections.defaultdict(list)
    for node in ast.parse(source).body:
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
            seen[node.name].append(node.lineno)
    return {name: lines for name, lines in seen.items() if len(lines) > 1}


def test_the_scan_catches_a_second_definition():
    assert _redefinitions("def f():\n    return 1\n\n\ndef f():\n    return 2\n") == {"f": [1, 5]}
    assert _redefinitions("def f():\n    return 1\n\n\nclass F:\n    pass\n") == {}


def test_no_backend_module_defines_a_top_level_name_twice():
    offenders = {}
    for path in sorted(PACKAGE.rglob("*.py")):
        rel = path.relative_to(PACKAGE)
        if rel.parts[0] in ("tests", "migrations"):
            continue
        found = _redefinitions(path.read_text())
        if found:
            offenders[str(rel)] = found
    assert offenders == {}, f"defined more than once (the later copy wins, the earlier is dead): {offenders}"
