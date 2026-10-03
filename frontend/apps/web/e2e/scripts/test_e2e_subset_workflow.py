"""delivery.pr-e2e-subset (PAD-511 phase 1): the workflow's shape is what the spec says.

The workflow cannot run in a unit test, so its contract is read from the file: when it runs
(rule 1), how a red run is bounded (rule 8), the second look at every red (rule 9), and that every
quarantined spec cites its ledger entry (rule 4). Pure: reads two files.
"""
import re
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[5]
WORKFLOW = ROOT / ".github/workflows/e2e-subset.yaml"
QUARANTINE = ROOT / "frontend/apps/web/e2e/pr-subset/quarantine.txt"
LEDGER = ROOT / ".cortex/compass/bugs"


def _wf():
    return yaml.safe_load(WORKFLOW.read_text())


def _triggers(wf):
    return wf.get("on", wf.get(True))  # PyYAML reads the bare key `on` as True


def _step(wf, name):
    steps = wf["jobs"]["subset"]["steps"]
    return next(s for s in steps if s.get("name") == name)


def test_it_runs_on_prs_into_staging_and_by_dispatch_only():
    wf = _wf()
    on = _triggers(wf)
    assert set(on) == {"pull_request", "workflow_dispatch"}
    assert on["pull_request"]["branches"] == ["staging"]
    assert {"head", "base"} <= set(on["workflow_dispatch"]["inputs"])
    assert wf["concurrency"]["cancel-in-progress"] is True
    assert "github.ref" in wf["concurrency"]["group"]


def test_a_red_run_costs_its_time_once_with_the_shared_timeout():
    run = _step(_wf(), "Run the subset")
    assert "--retries=0" in run["run"]
    assert "--timeout" not in run["run"]
    assert run["timeout-minutes"] == 20


def test_every_red_file_is_rerun_alone_and_labelled():
    rerun = _step(_wf(), "Re-run red files alone")
    assert "steps.run.outcome == 'failure'" in rerun["if"]
    assert "--retries=0" in rerun["run"] and "--timeout" not in rerun["run"]
    assert "order dependency" in rerun["run"] and "real failure" in rerun["run"]


def test_every_quarantined_spec_cites_its_ledger_entry_and_b286_is_there():
    lines = [l for l in QUARANTINE.read_text().splitlines() if l.strip() and not l.lstrip().startswith("#")]
    assert lines
    for line in lines:
        ids = re.findall(r"\bB-\d{3}\b", line.split("#", 1)[1] if "#" in line else "")
        assert ids, f"no ledger id: {line}"
        # The line goes when its entry is fixed (rule 4): at least one cited entry is still open.
        statuses = []
        for b in ids:
            entry = next(LEDGER.glob(f"{b}-*.md"), None)
            assert entry is not None, f"{b} has no ledger file in .cortex/compass/bugs: {line}"
            statuses.append(re.search(r"^status:\s*(\S+)", entry.read_text(), re.M).group(1))
        assert any(s != "resolved" for s in statuses), f"every cited entry is resolved: {line}"
    badge = [l for l in lines if l.split()[0] == "messaging/nav-unread-badge.spec.ts"]
    assert badge and "B-286" in badge[0] and "PAD-514" in badge[0]


def _step_names(wf):
    return [s.get("name") for s in wf["jobs"]["subset"]["steps"]]


def test_the_database_is_seeded_before_playwright_starts_on_an_isolated_stack():
    """Rule 7: Playwright starts its web servers before globalSetup, so Flask needs a seeded
    database first; all three isolation variables are set (else helpers/api.ts hits :5001)."""
    wf = _wf()
    names = _step_names(wf)
    assert names.index("Migrate + seed the isolated database") < names.index("Run the subset")
    env = wf["jobs"]["subset"]["env"]
    assert {"E2E_DB_NAME", "E2E_BACKEND_PORT", "E2E_WEB_PORT"} <= set(env)
    assert wf["jobs"]["subset"]["services"]["postgres"]["image"] == "postgres:15"


def test_the_check_is_red_when_the_run_is_red_and_says_when_the_cap_cut_it():
    """Rules 8-9: a red subset makes the check red; a run cut by the cap (no results file) says
    so instead of blaming the tests."""
    verdict = _step(_wf(), "Verdict")
    assert verdict["if"] == "always()"
    assert verdict["env"]["RUN_OUTCOME"] == "${{ steps.run.outcome }}"
    script = verdict["run"]
    assert '"$RUN_OUTCOME" = "failure"' in script and "exit 1" in script
    assert "results.json" in script and "cap hit (20 min) or setup failure, not a test failure" in script
