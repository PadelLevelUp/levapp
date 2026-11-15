"""Invitation scenarios (PAD-845): Tomás's 95 scenarios as one engine-agnostic suite.

Design: docs/plans/2026-11-10-scenario-harness-design.md (main checkout; docs/ is gitignored).

Always on, no database:
- every scenario file passes validate.py (the format contract);
- validate.py and scenario.schema.json name the same vocabulary.

Opt-in (design §8), because most scenarios fail on today's engine by design:
- ``INVITATION_SCENARIOS=1``: run every scenario through the today adapter; a scenario
  passes only if every checked expectation matched.
- ``INVITATION_SCENARIOS=baseline``: compare each scenario with baseline-today.yaml; a
  scenario that passed there and fails now fails the test, any other change is reported.
- ``INVITATION_SCENARIOS_OUT=<dir>``: also write each scenario's normalized log there.
- ``INVITATION_ENGINE=new`` (PAD-902): run against the redesign plan's engine through
  adapters/new.py instead of today's; unset or ``today`` keeps today's adapter. The baseline is
  today's, so ``baseline`` mode refuses ``new``.
- ``INVITATION_STORE=db`` (PAD-916), with ``INVITATION_ENGINE=new``: the same engine on the app's
  tables (adapters/new_db.py, ``services/engine_store.TableStore``) instead of ``MemoryStore``.
- ``INVITATION_ENGINE=app`` (PAD-918): the new engine driven the way the app drives it, through the
  stored configuration, the per-coach switch, the ``engine_tick`` job and the app's own entry points
  (adapters/app.py); the swap's acceptance gate.
"""
import json
import os
from pathlib import Path

import pytest
import yaml

from padel_app.tests.invitation_scenarios import validate
from padel_app.tests.invitation_scenarios.runner import dump_log, dump_yaml, run_scenario, scenario_paths

HERE = Path(__file__).parent
MODE = os.getenv("INVITATION_SCENARIOS", "").strip().lower()
ENGINE = os.getenv("INVITATION_ENGINE", "").strip().lower() or "today"
STORE = os.getenv("INVITATION_STORE", "").strip().lower() or "memory"
BASELINE = HERE / "baseline-today.yaml"


def test_every_scenario_file_validates():
    paths = scenario_paths()
    assert paths, "no scenario files"
    errors = []
    for path in paths:
        errors += validate.validate_file(path).errors
    assert not errors, "\n".join(errors)


def test_schema_and_validator_name_the_same_vocabulary():
    schema = json.loads((HERE / "scenario.schema.json").read_text(encoding="utf-8"))
    defs = schema["$defs"]
    assert set(schema["properties"]) == validate.TOP_KEYS_REQUIRED | validate.TOP_KEYS_OPTIONAL
    assert set(schema["required"]) == validate.TOP_KEYS_REQUIRED
    assert set(defs["settings"]["properties"]) == validate.SETTINGS_KEYS
    assert set(defs["expect"]["properties"]) - {"other_classes"} == validate.EXPECT_KEYS
    events = {k for alt in defs["event"]["oneOf"] for k in alt["required"]} - {"sides", "side", "event"}
    assert events == set(validate.EVENTS)
    assert set(defs["who"]["oneOf"][1]["properties"]["state"]["enum"]) == validate.STATES
    assert set(schema["properties"]["tags"]["x-known"]) == validate.TAGS


def _adapter(request):
    if ENGINE == "app":
        if MODE == "baseline":
            pytest.fail("baseline-today.yaml is today's engine's baseline; run INVITATION_ENGINE=app with "
                        "INVITATION_SCENARIOS=1")
        from padel_app.tests.invitation_scenarios.adapters.app import AppAdapter

        return AppAdapter(request.getfixturevalue("app"))
    if ENGINE == "new":
        if MODE == "baseline":
            pytest.fail("baseline-today.yaml is today's engine's baseline; run INVITATION_ENGINE=new with "
                        "INVITATION_SCENARIOS=1")
        if STORE == "db":
            from padel_app.tests.invitation_scenarios.adapters.new_db import NewDbAdapter

            return NewDbAdapter(request.getfixturevalue("app"))
        if STORE != "memory":
            pytest.fail(f"INVITATION_STORE={STORE!r}: expected memory or db")
        from padel_app.tests.invitation_scenarios.adapters.new import NewAdapter

        return NewAdapter()
    if ENGINE != "today":
        pytest.fail(f"INVITATION_ENGINE={ENGINE!r}: expected today, new or app")
    app = request.getfixturevalue("app")
    from padel_app.tests.invitation_scenarios.adapters.today import TodayAdapter

    return TodayAdapter(app)


def _baseline() -> dict:
    if not BASELINE.exists():
        return {}
    return yaml.safe_load(BASELINE.read_text(encoding="utf-8")) or {}


@pytest.mark.parametrize("path", scenario_paths(), ids=lambda p: p.stem)
def test_scenario(path, request):
    if MODE not in ("1", "baseline"):
        pytest.skip("opt-in: set INVITATION_SCENARIOS=1 (or =baseline) to run the invitation scenarios")
    result = run_scenario(path, _adapter(request))
    out = os.getenv("INVITATION_SCENARIOS_OUT")
    if out:
        dump_log(result, Path(out))
    report = dump_yaml(result.summary())

    if MODE == "1":
        assert result.outcome == "pass", report
        return

    was = _baseline().get(path.stem)
    if was is None:
        pytest.fail(f"{path.stem} is not in baseline-today.yaml\n{report}")
    if was["outcome"] == "pass":
        assert result.outcome == "pass", f"regression: passed in the baseline\n{report}"
    elif result.outcome == "pass":
        pytest.xfail(f"change to review: {path.stem} failed in the baseline ({was.get('class')}) and passes now")


class _ScriptedEngine:
    """A fake engine that does exactly what the PDF says for template 04, so the runner's
    clock, `who` resolution and comparisons are tested without a database. `wrong=True`
    makes it send the 20:20 round late, which must fail."""

    name = "scripted"

    def __init__(self, wrong=False, alert_at=None):
        self.wrong, self.alert_at = wrong, alert_at

    def setup(self, sc):
        from padel_app.tests.invitation_scenarios.runner import parse_local

        self.sc, self.parse = sc, parse_local
        self.roster = {p.id: p.side for p in sc.regulars()}
        self.placed_at, self.open, self.pending = {}, [], []
        self.plan = {
            "2026-11-01 19:00": ["L2R-1", "L2R-2", "L2R-3"],
            "2026-11-01 19:20": ["L2R-4"],
            "2026-11-01 20:25" if self.wrong else "2026-11-01 20:20": ["L3R-1", "L3R-2", "L3R-3"],
        }
        return []

    def tick(self, now):
        from padel_app.tests.invitation_scenarios.runner import Record, fmt

        for sid in self.plan.pop(fmt(now), []):
            self.open.append((sid, None, now))
            self.pending.append(Record("invited", sid, "A", now, {"side_named": None, "group": None}))
        if fmt(now) == self.alert_at:
            self.pending.append(Record("alert", "", "A", now, {"reason": "no_tier"}))

    def apply(self, event, who, params, cls, now):
        from padel_app.tests.invitation_scenarios.runner import Applied, Record

        assert event == "accepts"
        self.open = [o for o in self.open if o[0] != who]
        self.pending.append(Record("answered", who, "A", now, {"answer": "yes", "on": "invitation"}))
        if sum(1 for s in self.roster.values() if s == "R") < 8:
            self.roster[who], self.placed_at[who] = "R", now
            self.pending.append(Record("placed", who, "A", now, {"side": "R", "how": "invitation"}))
        else:
            self.pending.append(Record("message", who, "A", now, {"kind": "aviso"}))
        return Applied()

    def drain(self):
        out, self.pending = self.pending, []
        return out

    def snapshot(self, cls):
        from padel_app.tests.invitation_scenarios.runner import Snapshot

        return Snapshot(dict(self.roster), dict(self.placed_at), open_invitations=list(self.open))

    def unsupported(self, key, item=None):
        return None

    def teardown(self):
        pass


def test_runner_passes_a_correct_engine_and_fails_a_wrong_one():
    path = HERE / "scenarios" / "04-grupo-esgota-se-sem-resposta.yaml"
    good = run_scenario(path, _ScriptedEngine())
    assert good.outcome == "pass", yaml.safe_dump(good.summary())
    assert good.evaluated >= 8 and good.skipped == 0
    a = next(r.student for r in good.log if r.kind == "placed")
    assert a.startswith("L2R-"), "invited_at 19:00 must bind a member of the 19:00 round"

    bad = run_scenario(path, _ScriptedEngine(wrong=True))
    assert bad.outcome == "fail"
    assert bad.first.at == "2026-11-01 20:20" and bad.first.key == "invitations"


def test_coach_alert_true_needs_an_alert_record_and_false_needs_none(tmp_path):
    text = (HERE / "scenarios" / "04-grupo-esgota-se-sem-resposta.yaml").read_text(encoding="utf-8")
    text = text.replace("  - at: 2026-11-01 20:00\n    expect: {invitations: none}",
                        "  - at: 2026-11-01 20:00\n    expect: {invitations: none, coach_alert: true}")
    text = text.replace("  - at: 2026-11-01 19:00\n    expect: {invitations:",
                        "  - at: 2026-11-01 19:00\n    expect: {coach_alert: false, invitations:")
    assert text.count("coach_alert") == 2
    path = tmp_path / "04-grupo-esgota-se-sem-resposta.yaml"
    path.write_text(text, encoding="utf-8")

    good = run_scenario(path, _ScriptedEngine(alert_at="2026-11-01 20:00"))
    assert good.outcome == "pass", yaml.safe_dump(good.summary())

    late = run_scenario(path, _ScriptedEngine(alert_at="2026-11-01 20:05"))
    assert late.outcome == "fail" and late.first.key == "coach_alert"
    assert late.first.at == "2026-11-01 20:00"

    early = run_scenario(path, _ScriptedEngine(alert_at="2026-11-01 19:00"))
    assert early.outcome == "fail" and early.first.key == "coach_alert"
    assert early.first.at == "2026-11-01 19:00"
