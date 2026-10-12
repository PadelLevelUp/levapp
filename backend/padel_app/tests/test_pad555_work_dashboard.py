"""PAD-555 — admin.work-dashboard: `GET /admin/api/work` reads Linear and GitHub on the server
(their tokens never reach the client), each source on its own, cached for 5 minutes. Outside calls
go through `work_service._request`, replaced here by a fake keyed by URL.
"""
import json
from datetime import datetime, timedelta, timezone

import pytest

from padel_app.tests.admin_helpers import admin_token, bearer, make_role

LINEAR_KEY = "lin_api_SECRET555"
GITHUB_TOKEN = "ghp_SECRET555"
NOW = datetime.now(timezone.utc)


def _iso(days_ago):
    return (NOW - timedelta(days=days_ago)).strftime("%Y-%m-%dT%H:%M:%SZ")


LONG = ("**Problema:** as [fotos](https://x.example) não carregam no iPhone. "
        + "Passos para reproduzir: abrir o perfil, tocar na foto e esperar. " * 6)

LINEAR = {"data": {
    "open": {"nodes": [
        {"identifier": "PAD-8", "title": "Sem prioridade", "description": None, "priority": 0,
         "url": "https://linear.app/x/PAD-8", "createdAt": _iso(3), "state": {"name": "Backlog", "type": "backlog"},
         "assignee": None},
        {"identifier": "PAD-7", "title": "Atualizar fotos", "description": LONG, "priority": 1,
         "url": "https://linear.app/x/PAD-7", "createdAt": _iso(2), "state": {"name": "Todo", "type": "unstarted"},
         "assignee": {"name": "Levelup"}},
    ]},
    "done": {"nodes": [
        {"identifier": "PAD-5", "title": "Feito há pouco", "url": "u5", "completedAt": _iso(2), "state": {"name": "Done"}},
        {"identifier": "PAD-4", "title": "Feito há muito", "url": "u4", "completedAt": _iso(40), "state": {"name": "Done"}},
    ]},
}}


def _pr(number, base, merge_sha, merged_days, branch="feature/pad-10"):
    return {"number": number, "title": f"feat(PAD-{number}): x", "html_url": f"https://gh/{number}", "draft": False,
            "base": {"ref": base}, "head": {"ref": branch, "sha": f"head{number}"},
            "merged_at": _iso(merged_days) if merged_days is not None else None, "merge_commit_sha": merge_sha}


def _github(url):
    if "/pulls?state=closed" in url and "base=staging" in url:
        if "page=1&" in url or url.endswith("page=1"):
            # A full first page of recently touched, unmerged PRs pushes a merged one to page 2.
            return [_pr(100 + i, "staging", None, None) for i in range(100)]
        if "page=2" in url:
            return [_pr(10, "staging", "sha10", 1, "feature/pad-10"), _pr(11, "staging", "sha11", 1, "feature/pad-11"),
                    _pr(12, "staging", None, None), _pr(13, "staging", "sha13", 45)]
        return []
    if "/pulls?state=closed" in url and "base=main" in url:
        return [_pr(20, "main", "sha20", 2, "feature/pad-20"), _pr(21, "main", "sha21", 2, "staging")] if "page=1" in url else []
    if "/compare/main...staging" in url:
        # Commits on staging that main does not have yet: #11's merge commit.
        return {"commits": [{"sha": "sha11"}]}
    if "/pulls?state=open" in url:
        return [{**_pr(30, "staging", None, None, "feature/pad-30"), "draft": True}]
    if "/actions/workflows/" in url:
        return {"workflow_runs": [{"status": "completed", "conclusion": "success", "head_sha": "abcdef1234567",
                                   "created_at": _iso(1), "html_url": "https://gh/run"}]}
    raise AssertionError(f"unexpected GitHub call {url}")


GRAPHQL_ERRORS = []


@pytest.fixture
def calls(monkeypatch):
    from padel_app.services.admin import work_service

    work_service.reset_cache()
    seen = []

    def fake(method, url, headers=None, json=None):
        seen.append((method, url, headers or {}))
        if "linear.app" in url:
            return LINEAR
        if url.startswith("https://api.github.com/graphql"):
            if GRAPHQL_ERRORS:
                return {"errors": [{"message": "Bad credentials"}], "data": None}
            return {"data": {"repository": {"pullRequests": {"nodes": [
                {"number": 30, "commits": {"nodes": [{"commit": {"statusCheckRollup": {"state": "FAILURE"}}}]}}]}}}}
        return _github(url)

    monkeypatch.setattr(work_service, "_request", fake)
    return seen


@pytest.fixture
def operator(app):
    app.config["LINEAR_API_KEY"] = LINEAR_KEY
    app.config["WORK_GITHUB_TOKEN"] = GITHUB_TOKEN
    app.config["WORK_GITHUB_REPO"] = "PadelLevelUp/levapp"
    return bearer(admin_token(app, make_role(app, "op555@levapp.app", "operator")))


def _work(client, headers, query=""):
    res = client.get(f"/admin/api/work{query}", headers=headers)
    assert res.status_code == 200, res.get_json()
    return res.get_json()


def test_tickets_have_a_plain_summary_and_are_sorted(client, operator, calls):
    linear = _work(client, operator)["linear"]
    assert linear["status"] == "ok"
    first = linear["open"][0]
    assert first["id"] == "PAD-7"  # urgent before no priority
    assert first["summary"].startswith("Problema: as fotos não carregam no iPhone.")
    assert len(first["summary"]) <= 200 and first["summary"].endswith("…")
    assert "**" not in first["summary"] and "https://x.example" not in first["summary"]
    assert linear["open"][1]["summary"] == ""
    assert [t["id"] for t in linear["done"]] == ["PAD-5"]


def test_where_a_merged_pr_is(client, operator, calls):
    merged = {p["number"]: p for p in _work(client, operator)["github"]["merged"]}
    assert merged[10]["where"] == "production"
    assert merged[11]["where"] == "staging"
    assert merged[20]["where"] == "production"
    assert 12 not in merged and 13 not in merged  # not merged / older than 30 days
    assert 21 not in merged  # a staging → main promotion is the release, not a change of its own
    assert merged[11]["tickets"] == ["PAD-11"]


def test_open_prs_and_deploys(client, operator, calls):
    github = _work(client, operator)["github"]
    assert github["open"] == [{"number": 30, "title": "feat(PAD-30): x", "url": "https://gh/30", "base": "staging",
                               "draft": True, "checks": "failure", "tickets": ["PAD-30"]}]
    assert github["deploys"]["staging"][0]["sha"] == "abcdef1"
    assert github["deploys"]["production"][0]["conclusion"] == "success"


def test_not_configured_and_no_token_in_the_answer(client, app, operator, calls):
    app.config["LINEAR_API_KEY"] = ""
    body = _work(client, operator)
    assert body["linear"] == {"status": "not_configured", "missing": "LINEAR_API_KEY"}
    assert body["github"]["status"] == "ok"
    assert LINEAR_KEY not in json.dumps(body) and GITHUB_TOKEN not in json.dumps(body)


def test_github_without_a_repository_is_not_configured_and_never_called(client, app, operator, calls):
    app.config["WORK_GITHUB_REPO"] = ""
    body = _work(client, operator)
    assert body["github"] == {"status": "not_configured", "missing": "WORK_GITHUB_REPO"}
    assert not any("github" in url for _, url, _ in calls)


def test_without_a_github_token_checks_are_unknown(client, app, operator, calls):
    app.config["WORK_GITHUB_TOKEN"] = ""
    github = _work(client, operator)["github"]
    assert github["open"][0]["checks"] is None
    assert not any("graphql" in url for _, url, _ in calls if "github" in url)
    assert all("Authorization" not in h for _, url, h in calls if "github" in url)


def test_a_source_down_leaves_the_other(client, operator, calls, monkeypatch):
    from padel_app.services.admin import work_service

    real = work_service._request

    def flaky(method, url, headers=None, json=None):
        if "github" in url:
            raise TimeoutError("github slow")
        return real(method, url, headers=headers, json=json)

    monkeypatch.setattr(work_service, "_request", flaky)
    body = _work(client, operator)
    assert body["github"]["status"] == "unavailable"
    assert body["linear"]["status"] == "ok"


def test_support_cannot_see_it(client, app, calls):
    support = bearer(admin_token(app, make_role(app, "sup555@levapp.app", "support")))
    assert client.get("/admin/api/work", headers=support).status_code == 403
    assert calls == []


def test_a_checks_query_error_leaves_github_ok(client, operator, calls):
    GRAPHQL_ERRORS.append(True)
    try:
        github = _work(client, operator)["github"]
    finally:
        GRAPHQL_ERRORS.clear()
    assert github["status"] == "ok"
    assert github["open"][0]["checks"] is None


def test_a_refresh_right_after_a_cold_load_is_not_a_second_fetch(client, operator, calls):
    _work(client, operator)
    first = len(calls)
    _work(client, operator, "?refresh=1")
    assert len(calls) == first


def test_cached_and_refresh_at_most_once_a_minute(client, operator, calls, monkeypatch):
    from padel_app.services.admin import work_service

    clock = [1000.0]
    monkeypatch.setattr(work_service.time, "monotonic", lambda: clock[0])
    _work(client, operator)
    first = len(calls)
    assert first > 0
    clock[0] += 30
    _work(client, operator)
    assert len(calls) == first
    clock[0] += 31
    _work(client, operator, "?refresh=1")
    second = len(calls)
    assert second > first
    _work(client, operator, "?refresh=1")
    assert len(calls) == second
