"""PAD-646 — admin.work-dashboard v2 (rules 9–11): TestFlight builds from App Store Connect, open
bugs from the ledger index and CI lane timing from GitHub Actions, each a source of its own beside
v1's two. Outside calls go through `work_service._request`, replaced by a fake keyed by URL; the
App Store Connect key is generated here, never committed.
"""
import base64
import json
from datetime import datetime, timedelta, timezone

import jwt
import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ec

from padel_app.tests.admin_helpers import admin_token, bearer, make_role

GITHUB_TOKEN = "ghp_SECRET646"
NOW = datetime.now(timezone.utc)
_KEY = ec.generate_private_key(ec.SECP256R1())
ASC_PEM = _KEY.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8,
                             serialization.NoEncryption()).decode()
ASC_PUBLIC = _KEY.public_key()


def _iso(minutes_ago=0, days_ago=0):
    return (NOW - timedelta(days=days_ago, minutes=minutes_ago)).strftime("%Y-%m-%dT%H:%M:%SZ")


INDEX = """# Bug ledger — index

**Read this when:** …
- [B-1](B-1-login-loop.md) — the login loops on a stale token (incomplete-rule, high, open)
- [B-2](B-2-chip-colour.md) — a chip has the wrong colour (wrong-test, low, triaged)
- [B-3](B-3-old.md) — an old one (layer-drift, high, resolved in PAD-9)
- [B-4](B-4-broken.md) — a line with no parenthesis
"""

BACKEND_TESTS_YAML = """name: Backend tests
jobs:
  sqlite:
    name: pytest (sqlite, FK on)
    runs-on: ubuntu-latest
    timeout-minutes: 60
    steps:
      - run: echo
  shards:
    name: postgres shards cover the suite
    runs-on: ubuntu-latest
    steps:
      - run: echo
"""


def _contents(text):
    return {"encoding": "base64", "content": base64.b64encode(text.encode()).decode()}


def _job(name, minutes, conclusion="success"):
    return {"name": name, "conclusion": conclusion, "started_at": _iso(minutes_ago=minutes + 5),
            "completed_at": _iso(minutes_ago=5)}


def _runs(n, conclusions):
    return {"workflow_runs": [{"id": 900 + i, "status": "completed", "conclusion": conclusions[i % len(conclusions)],
                               "html_url": f"https://gh/run/{900 + i}", "created_at": _iso(days_ago=i)}
                              for i in range(n)]}


SQLITE_MINUTES = [30, 31, 40, 49, 50]  # newest first


def _github(url):
    if "/contents/.cortex/compass/bugs/_index.md" in url:
        return _contents(INDEX)
    if "/contents/.github/workflows/backend-tests.yaml" in url:
        return _contents(BACKEND_TESTS_YAML)
    if "/contents/.github/workflows/" in url:
        return _contents("name: x\njobs: {}\n")
    if "/actions/workflows/backend-tests.yaml/runs" in url:
        return _runs(10, ["success", "success", "failure", "success", "cancelled"])
    if "/actions/workflows/" in url and "/runs" in url:
        return {"workflow_runs": []}
    if "/actions/runs/" in url and url.split("?")[0].endswith("/jobs"):
        run_id = int(url.split("/actions/runs/")[1].split("/")[0])
        return {"jobs": [_job("pytest (sqlite, FK on)", SQLITE_MINUTES[run_id - 900]),
                         _job("postgres shards cover the suite", 1)]}
    # v1's GitHub reads (PRs, compare, deploys) are not this file's subject.
    if "/pulls" in url or "/compare/" in url:
        return [] if "/pulls" in url else {"commits": []}
    raise AssertionError(f"unexpected GitHub call {url}")


ASC_BUILDS = {
    "data": [{"id": "b34", "type": "builds",
              "attributes": {"version": "34", "uploadedDate": "2026-10-20T10:00:00.000-07:00",
                             "processingState": "VALID", "expired": False},
              "relationships": {"preReleaseVersion": {"data": {"id": "p132", "type": "preReleaseVersions"}},
                                "buildBetaDetail": {"data": {"id": "d34", "type": "buildBetaDetails"}},
                                "betaBuildLocalizations": {"data": [{"id": "l34", "type": "betaBuildLocalizations"}]}}}],
    "included": [
        {"id": "p132", "type": "preReleaseVersions", "attributes": {"version": "1.3.2", "platform": "IOS"}},
        {"id": "d34", "type": "buildBetaDetails",
         "attributes": {"internalBuildState": "IN_BETA_TESTING", "externalBuildState": "READY_FOR_BETA_SUBMISSION"}},
        {"id": "l34", "type": "betaBuildLocalizations", "attributes": {"locale": "pt-PT", "whatsNew": "Som das notificações"}},
    ],
}


@pytest.fixture
def calls(monkeypatch):
    from padel_app.services.admin import work_service

    work_service.reset_cache()
    seen = []

    def fake(method, url, headers=None, json=None):
        seen.append((method, url, headers or {}))
        if "linear.app" in url:
            return {"data": {"open": {"nodes": []}, "done": {"nodes": []}}}
        if url.startswith("https://api.appstoreconnect.apple.com/"):
            return ASC_BUILDS
        if url.startswith("https://api.github.com/graphql"):
            return {"data": {"repository": {"pullRequests": {"nodes": []}}}}
        return _github(url)

    monkeypatch.setattr(work_service, "_request", fake)
    return seen


@pytest.fixture
def operator(app):
    app.config["LINEAR_API_KEY"] = ""
    app.config["WORK_GITHUB_TOKEN"] = GITHUB_TOKEN
    app.config["WORK_GITHUB_REPO"] = "PadelLevelUp/levapp"
    for key in ("ASC_KEY_ID", "ASC_ISSUER_ID", "ASC_PRIVATE_KEY", "ASC_APP_ID"):
        app.config[key] = ""
    return bearer(admin_token(app, make_role(app, "op646@levapp.app", "operator")))


def _work(client, headers):
    res = client.get("/admin/api/work", headers=headers)
    assert res.status_code == 200, res.get_json()
    return res.get_json()


# ── rule 9: TestFlight ────────────────────────────────────────────────────────

def test_testflight_is_not_configured_until_the_key_exists(client, operator, calls):
    body = _work(client, operator)
    assert body["testflight"] == {"status": "not_configured", "missing": "ASC_KEY_ID"}
    assert not any("appstoreconnect" in url for _, url, _ in calls)


def test_testflight_lists_builds_with_a_signed_token_and_never_echoes_it(client, app, operator, calls):
    app.config.update(ASC_KEY_ID="KEY646", ASC_ISSUER_ID="issuer-646", ASC_PRIVATE_KEY=ASC_PEM, ASC_APP_ID="6740000000")
    body = _work(client, operator)

    tf = body["testflight"]
    assert tf["status"] == "ok"
    assert tf["builds"] == [{"build": "34", "version": "1.3.2", "uploadedAt": "2026-10-20T10:00:00.000-07:00",
                             "processingState": "VALID", "expired": False, "internalState": "IN_BETA_TESTING",
                             "externalState": "READY_FOR_BETA_SUBMISSION", "whatToTest": "Som das notificações"}]
    (_, url, headers), = [c for c in calls if "appstoreconnect" in c[1]]
    assert "filter[app]=6740000000" in url and "sort=-uploadedDate" in url
    token = headers["Authorization"].removeprefix("Bearer ")
    claims = jwt.decode(token, ASC_PUBLIC, algorithms=["ES256"], audience="appstoreconnect-v1")
    assert claims["iss"] == "issuer-646" and claims["exp"] - claims["iat"] <= 20 * 60
    assert jwt.get_unverified_header(token)["kid"] == "KEY646"
    dumped = json.dumps(body)
    assert token not in dumped and "PRIVATE KEY" not in dumped and GITHUB_TOKEN not in dumped


# ── rule 10: open bugs ────────────────────────────────────────────────────────

def test_open_bugs_by_severity_from_the_index(client, operator, calls):
    bugs = _work(client, operator)["bugs"]
    assert bugs["status"] == "ok"
    assert [(b["id"], b["severity"], b["status"]) for b in bugs["open"]] == [("B-1", "high", "open"), ("B-2", "low", "triaged")]
    assert bugs["open"][0]["url"] == "https://github.com/PadelLevelUp/levapp/blob/staging/.cortex/compass/bugs/B-1-login-loop.md"
    assert bugs["counts"] == {"open": {"high": 1, "low": 1}, "resolved": 1}
    assert bugs["unparsed"] == 1
    index_calls = [url for _, url, _ in calls if "bugs/_index.md" in url]
    assert len(index_calls) == 1 and "ref=staging" in index_calls[0]


def test_bugs_without_a_repository_are_not_configured(client, app, operator, calls):
    app.config["WORK_GITHUB_REPO"] = ""
    assert _work(client, operator)["bugs"] == {"status": "not_configured", "missing": "WORK_GITHUB_REPO"}


# ── rule 11: CI lanes ─────────────────────────────────────────────────────────

def test_ci_lanes_timing_against_their_limit(client, operator, calls):
    ci = _work(client, operator)["ci"]
    assert ci["status"] == "ok"
    backend = next(w for w in ci["workflows"] if w["workflow"] == "backend-tests.yaml")
    # 10 runs: 2 cancelled excluded, 2 failures over the 8 others.
    assert backend["failureRate"] == 0.25 and backend["runs"] == 8
    lanes = {lane["name"]: lane for lane in backend["lanes"]}
    sqlite = lanes["pytest (sqlite, FK on)"]
    assert (sqlite["latestMinutes"], sqlite["medianMinutes"], sqlite["longestMinutes"]) == (30, 40, 50)
    assert sqlite["timeoutMinutes"] == 60 and sqlite["nearLimit"] is True
    shards = lanes["postgres shards cover the suite"]
    assert shards["timeoutMinutes"] == 360 and shards["nearLimit"] is False  # GitHub's default when unset
    jobs_calls = [url for _, url, _ in calls if "/backend-tests.yaml" not in url and "/jobs" in url]
    assert len(jobs_calls) == 5


def test_ci_needs_the_token_and_never_calls_actions_without_it(client, app, operator, calls):
    app.config["WORK_GITHUB_TOKEN"] = ""
    assert _work(client, operator)["ci"] == {"status": "not_configured", "missing": "WORK_GITHUB_TOKEN"}
    assert not any("/actions/runs/" in url or "/runs?" in url and "deploy" not in url for _, url, _ in calls)


def test_the_real_workflow_files_parse(app):
    """The lane limits come from our own workflow files; pin that every CI job name the parser reads
    has a number (or the default) so a reformatted file can't silently zero them."""
    import pathlib

    from padel_app.services.admin.work_service import CI_WORKFLOWS, job_timeouts

    root = pathlib.Path(__file__).resolve().parents[3] / ".github" / "workflows"
    for workflow in CI_WORKFLOWS:
        limits = job_timeouts((root / workflow).read_text())
        assert limits, workflow
        assert all(isinstance(v, int) and v > 0 for v in limits.values()), (workflow, limits)
    assert job_timeouts((root / "backend-tests.yaml").read_text())["pytest (sqlite, FK on)"] == 60
