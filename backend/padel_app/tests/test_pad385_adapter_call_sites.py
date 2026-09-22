"""PAD-385 (step 0 of PAD-367, B-136) — who calls JsonRequestAdapter, and in which mode.

The adapter sits under every JSON write in the app, so "this step changed nothing but
the two call sites it names" has to be mechanical, not a promise:

* `PRESENT` lists every call site that opts into `mode="present"`, by file and enclosing
  function. The scan must equal it EXACTLY. In step 0 it is empty — that is the proof
  that no caller was switched. Steps 1-5 (PAD-386 ... PAD-390) each add their own.
* `LEGACY_MAX` is a ratchet per file. More legacy calls than listed fails (a new caller
  must choose present mode, or argue here); FEWER fails too, with "lower the max" —
  headroom would let a new legacy caller in silently.
* A call the scanner cannot classify FAILS instead of counting as legacy: a mode that is
  not a string literal, `*args` / `**kwargs` in the call, the name imported under an
  alias, reached through `getattr`, or referenced (by name or through its module) other
  than as the callee of a direct call — bound to a variable, subclassed, passed around.
* The adapter itself closes the other door: `mode` is read-only and `present` exists only
  in present mode, so no legacy call can be turned into a present one after the fact.
* Out of reach by design, and said so: a name built at run time (`"Json" + "…"`), and
  files outside `backend/padel_app` (`backend/scripts/`, `migrations/`) — none calls the
  adapter today. LEGACY_MAX is a drift alarm a developer can bump with a reason in the
  diff; PRESENT is the mechanical part.

`LEGACY_MAX` is the scanner's own output on origin/staging 589f1977d (27 calls in 8 service
files; a grep made beforehand gave the same 27, as a cross-check, not as the source). To
regenerate: print `_scan()[0]` and paste it.
"""
import ast
from pathlib import Path

import pytest

PACKAGE = Path(__file__).resolve().parents[1]  # backend/padel_app
NAME = "JsonRequestAdapter"
DEFINING_MODULE = "tools/request_adapter.py"

#: (file, enclosing function) of every call that passes mode="present".
PRESENT: set = {
    # PAD-387 (step 2): POST /edit_class
    ("services/lesson_service.py", "edit_lesson_helper"),
    ("services/lesson_service.py", "edit_lesson_instance_helper"),
}

#: legacy-mode calls per file; the numbers only ever go down.
LEGACY_MAX = {
    "services/calendar_service.py": 4,
    "services/club_service.py": 2,
    "services/coach_service.py": 3,
    "services/import_service.py": 1,
    "services/lesson_service.py": 4,
    "services/messaging_service.py": 2,
    "services/player_service.py": 6,
    "services/user_service.py": 3,
}


class _Scan(ast.NodeVisitor):
    def __init__(self, file):
        self.file = file
        self.stack = []
        self.legacy = 0
        self.present = set()
        self.problems = []

    def _function(self, node):
        self.stack.append(node.name)
        self.generic_visit(node)
        self.stack.pop()

    visit_FunctionDef = _function
    visit_AsyncFunctionDef = _function
    visit_ClassDef = _function

    def visit_ImportFrom(self, node):
        for alias in node.names:
            if alias.name == NAME and alias.asname not in (None, NAME):
                self.problems.append(f"{self.file}:{node.lineno}: imported as {alias.asname!r}; import it by its name")

    def visit_Call(self, node):
        callee = node.func
        named = (isinstance(callee, ast.Name) and callee.id == NAME) or (
            isinstance(callee, ast.Attribute) and callee.attr == NAME
        )
        if named:
            where = ".".join(self.stack) or "<module>"
            unpacked = any(isinstance(arg, ast.Starred) for arg in node.args) or any(
                kw.arg is None for kw in node.keywords
            )
            mode = next((kw.value for kw in node.keywords if kw.arg == "mode"), None)
            if mode is None and len(node.args) >= 3:
                mode = node.args[2]
            if unpacked:
                self.problems.append(
                    f"{self.file}:{node.lineno} ({where}): *args / **kwargs in the call — the mode cannot be read"
                )
            elif mode is None:
                self.legacy += 1
            elif isinstance(mode, ast.Constant) and mode.value == "legacy":
                self.legacy += 1
            elif isinstance(mode, ast.Constant) and mode.value == "present":
                self.present.add((self.file, where))
            else:
                self.problems.append(
                    f"{self.file}:{node.lineno} ({where}): mode is not a string literal — it cannot be audited"
                )
            for child in list(node.args) + [kw.value for kw in node.keywords]:
                self.visit(child)
            return
        if isinstance(callee, ast.Name) and callee.id == "getattr":
            if any(isinstance(arg, ast.Constant) and arg.value == NAME for arg in node.args):
                self.problems.append(
                    f"{self.file}:{node.lineno}: {NAME} reached through getattr; the scanner cannot follow it"
                )
        self.generic_visit(node)

    def _indirect(self, node, how):
        # Reached only for a use that is NOT the callee of a direct call (visit_Call skips its func).
        self.problems.append(
            f"{self.file}:{node.lineno}: {NAME} {how} other than as a direct call; the scanner cannot follow it"
        )

    def visit_Name(self, node):
        if node.id == NAME:
            self._indirect(node, "used")

    def visit_Attribute(self, node):
        if node.attr == NAME:
            self._indirect(node, "referenced through its module")
        self.generic_visit(node)


def _scan_source(source, file):
    scan = _Scan(file)
    scan.visit(ast.parse(source))
    return scan


def _scan():
    legacy, present, problems = {}, set(), []
    for path in sorted(PACKAGE.rglob("*.py")):
        file = path.relative_to(PACKAGE).as_posix()
        if file.startswith("tests/") or file == DEFINING_MODULE:
            continue
        source = path.read_text(encoding="utf-8")
        if NAME not in source:
            continue
        scan = _scan_source(source, file)
        if scan.legacy:
            legacy[file] = scan.legacy
        present |= scan.present
        problems += scan.problems
    return legacy, present, problems


def test_the_scanner_sees_each_kind_of_call_it_claims_to():
    """Positive control, on a source string: a scanner that finds nothing would pass everything below."""
    scan = _scan_source(
        "from padel_app.tools.request_adapter import JsonRequestAdapter\n"
        "from padel_app.tools import request_adapter\n"
        "def old(data, form):\n"
        "    return JsonRequestAdapter(data, form)\n"
        "def old_spelled_out(data, form):\n"
        "    return JsonRequestAdapter(data, form, mode='legacy')\n"
        "class Service:\n"
        "    def new(self, data, form):\n"
        "        return request_adapter.JsonRequestAdapter(data, form, mode='present')\n"
        "def positional(data, form):\n"
        "    return JsonRequestAdapter(data, form, 'present')\n"
        "def unauditable(data, form, m):\n"
        "    return JsonRequestAdapter(data, form, mode=m)\n"
        "def smuggled(data, form):\n"
        "    build = JsonRequestAdapter\n"
        "    return build(data, form, mode='present')\n",
        "example.py",
    )
    assert scan.legacy == 2
    assert scan.present == {("example.py", "Service.new"), ("example.py", "positional")}
    assert len(scan.problems) == 2
    assert "not a string literal" in scan.problems[0] and "(unauditable)" in scan.problems[0]
    assert "other than as a direct call" in scan.problems[1]

    aliased = _scan_source("from padel_app.tools.request_adapter import JsonRequestAdapter as J\n", "alias.py")
    assert aliased.problems and "imported as 'J'" in aliased.problems[0]


EVASIONS = {
    # Session-B's review of #366 (2026-09-22): each of these ran as PRESENT, or could not be
    # told apart, while the first scanner counted it as legacy or saw nothing at all.
    "bound-through-the-module": (
        "from padel_app.tools import request_adapter\n"
        "def f(d, f):\n    build = request_adapter.JsonRequestAdapter\n    return build(d, f, mode='present')\n"),
    "subclass-through-the-module": (
        "from padel_app.tools import request_adapter\n"
        "class P(request_adapter.JsonRequestAdapter):\n    pass\n"),
    "getattr": (
        "from padel_app.tools import request_adapter\n"
        "def f(d, f):\n    return getattr(request_adapter, 'JsonRequestAdapter')(d, f, mode='present')\n"),
    "double-star-kwargs": (
        "from padel_app.tools.request_adapter import JsonRequestAdapter\n"
        "def f(d, f):\n    return JsonRequestAdapter(d, f, **{'mode': 'present'})\n"),
    "star-args": (
        "from padel_app.tools.request_adapter import JsonRequestAdapter\n"
        "def f(d, a):\n    return JsonRequestAdapter(d, *a)\n"),
}


@pytest.mark.parametrize("evasion", sorted(EVASIONS), ids=sorted(EVASIONS))
def test_a_call_the_scanner_cannot_classify_fails_instead_of_counting_as_legacy(evasion):
    scan = _scan_source(EVASIONS[evasion], "evasion.py")
    assert scan.legacy == 0 and scan.present == set()
    assert scan.problems, f"{evasion}: the scanner saw nothing wrong"


def test_every_call_site_can_be_audited():
    _, _, problems = _scan()
    assert problems == []


def test_the_callers_in_present_mode_are_exactly_the_ones_listed():
    """Step 0: the list is empty — no caller was switched, so no route changed behaviour."""
    _, present, _ = _scan()
    assert present == PRESENT


def test_legacy_callers_can_only_go_down_and_the_ratchet_follows_them():
    legacy, _, _ = _scan()
    unlisted = sorted(set(legacy) - set(LEGACY_MAX))
    assert not unlisted, f"new legacy-mode callers in {unlisted}: choose mode='present', or add the file here and say why"
    for file, allowed in sorted(LEGACY_MAX.items()):
        found = legacy.get(file, 0)
        assert found <= allowed, f"{file}: {found} legacy-mode calls, the ratchet allows {allowed}"
        assert found == allowed, (
            f"{file}: {found} legacy-mode calls, ratchet still says {allowed}. Lower it to {found} "
            "(remove the entry at 0) — leaving headroom lets new ones back in silently."
        )
