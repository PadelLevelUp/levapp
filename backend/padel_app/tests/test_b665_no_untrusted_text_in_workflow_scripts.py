"""B-665 — no workflow splices text a pull request's author chooses into a shell script.

`${{ github.head_ref }}` inside a `run:` is substituted before the shell parses the script, so a
branch named `x";curl …;"` runs. Untrusted values reach a step through `env:` and are read as
shell variables. This scans every workflow's `run:` scripts (and composite-action `run:`s) for the
contexts GitHub documents as attacker-controllable.
"""
import re
from pathlib import Path

import yaml

WORKFLOWS = Path(__file__).resolve().parents[3] / ".github" / "workflows"

UNTRUSTED = re.compile(
    r"\$\{\{[^}]*\b(github\.head_ref"
    r"|github\.event\.(pull_request|issue|comment|review|review_comment|discussion|discussion_comment)\.[a-z_.]*(title|body|ref|label|message|name|email)"
    r"|github\.event\.(head_commit|commits)[a-z_.\[\]*0-9]*\.(message|author)"
    r"|github\.event\.pages[a-z_.\[\]*0-9]*\.page_name)[^}]*\}\}"
)


def run_scripts(node, where=""):
    if isinstance(node, dict):
        for key, value in node.items():
            if key == "run" and isinstance(value, str):
                yield where, value
            else:
                yield from run_scripts(value, f"{where}/{key}")
    elif isinstance(node, list):
        for i, value in enumerate(node):
            yield from run_scripts(value, f"{where}[{i}]")


def test_no_run_script_splices_untrusted_text():
    offenders = []
    for path in sorted(WORKFLOWS.glob("*.y*ml")):
        for where, script in run_scripts(yaml.safe_load(path.read_text())):
            for m in UNTRUSTED.finditer(script):
                offenders.append(f"{path.name}{where}: {m.group(0)}")
    assert offenders == [], "pass these through env: instead:\n" + "\n".join(offenders)


def test_the_scan_sees_the_pattern():
    assert UNTRUSTED.search('echo "${{ github.head_ref }}"')
    assert UNTRUSTED.search("echo ${{ github.event.pull_request.title }}")
    assert UNTRUSTED.search("echo ${{ github.event.head_commit.message }}")
    assert not UNTRUSTED.search('echo "$HEAD_REF" ${{ github.sha }} ${{ github.ref_name }}')
