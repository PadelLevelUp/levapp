"""admin.work-dashboard (PAD-555): tickets from Linear and pull requests and deploys from GitHub,
for the staff console. Read-only; the tokens stay here (rule 5).

Each source is answered on its own (rule 1): `ok`, `not_configured` (a setting is missing) or
`unavailable` (it could not be reached). The whole answer is cached in this process for 5 minutes,
and a forced refresh is honoured at most once a minute (rule 7).
"""
from __future__ import annotations

import re
import threading
import time
from datetime import datetime, timedelta, timezone

from flask import current_app

LINEAR_URL = "https://api.linear.app/graphql"
GITHUB_API = "https://api.github.com"
TEAM_KEY = "PAD"
WINDOW_DAYS = 30
CACHE_SECONDS = 300
REFRESH_EVERY_SECONDS = 60
TIMEOUT_SECONDS = 10
SUMMARY_MAX = 200

_lock = threading.Lock()
_cache: dict = {}


def reset_cache():
    with _lock:
        _cache.clear()


def _request(method, url, headers=None, json=None):
    """The one outside call (tests replace it). Raises on any HTTP error or timeout."""
    import requests

    res = requests.request(method, url, headers=headers or {}, json=json, timeout=TIMEOUT_SECONDS)
    res.raise_for_status()
    return res.json()


# ── summaries ───────────────────────────────────────────────────────────────────────────────

_MD_LINK = re.compile(r"!?\[([^\]]*)\]\([^)]*\)")
_MENTION = re.compile(r"<(issue|user|document|project)[^>]*>(.*?)</\1>", re.S)
_TAG = re.compile(r"<[^>]+>")
_MARKS = re.compile(r"(\*\*|__|`+|~~|^\s{0,3}#{1,6}\s+|^\s*[-*+]\s+(?:\[[ xX]\]\s+)?|^\s*>\s?)", re.M)


def summary(description):
    """Rule 2: the description as plain text, cut at a word to at most 200 characters."""
    if not description:
        return ""
    text = _MENTION.sub(r"\2", description)
    text = _MD_LINK.sub(r"\1", text)
    text = _TAG.sub("", text)
    text = _MARKS.sub("", text)
    text = re.sub(r"\s+", " ", text).strip()
    if len(text) <= SUMMARY_MAX:
        return text
    cut = text[: SUMMARY_MAX - 1]
    if " " in cut:
        cut = cut[: cut.rfind(" ")]
    return cut.rstrip(" ,;:.-") + "…"


# ── Linear ──────────────────────────────────────────────────────────────────────────────────

_LINEAR_QUERY = """
query Work($since: DateTimeOrDuration!) {
  open: issues(first: 150, filter: {team: {key: {eq: "%(team)s"}},
               state: {type: {in: ["backlog", "unstarted", "started"]}}}) {
    nodes { identifier title description priority url createdAt
            state { name type } assignee { name } }
  }
  done: issues(first: 150, filter: {team: {key: {eq: "%(team)s"}}, completedAt: {gte: $since}}) {
    nodes { identifier title url completedAt state { name } }
  }
}
""" % {"team": TEAM_KEY}

#: In progress first, then to do, then backlog; within each, Linear's priority 1 (urgent) … 4 (low),
#: and 0 (no priority) last.
_STATE_ORDER = {"started": 0, "unstarted": 1, "backlog": 2}


def _linear(config, now):
    key = (config.get("LINEAR_API_KEY") or "").strip()
    if not key:
        return {"status": "not_configured", "missing": "LINEAR_API_KEY"}
    since = (now - timedelta(days=WINDOW_DAYS)).strftime("%Y-%m-%dT%H:%M:%SZ")
    data = _request("POST", LINEAR_URL, headers={"Authorization": key, "Content-Type": "application/json"},
                    json={"query": _LINEAR_QUERY, "variables": {"since": since}})["data"]
    open_ = [
        {
            "id": n["identifier"],
            "title": n["title"],
            "summary": summary(n.get("description")),
            "state": (n.get("state") or {}).get("name"),
            "stateType": (n.get("state") or {}).get("type"),
            "priority": n.get("priority") or 0,
            "assignee": (n.get("assignee") or {}).get("name"),
            "createdAt": n.get("createdAt"),
            "url": n.get("url"),
        }
        for n in data["open"]["nodes"]
    ]
    open_.sort(key=lambda t: (_STATE_ORDER.get(t["stateType"], 3), t["priority"] or 5, t["createdAt"] or ""))
    done = [
        {"id": n["identifier"], "title": n["title"], "completedAt": n.get("completedAt"), "url": n.get("url")}
        for n in data["done"]["nodes"]
        if (n.get("completedAt") or "") >= since
    ]
    done.sort(key=lambda t: t["completedAt"] or "", reverse=True)
    return {"status": "ok", "open": open_, "done": done}


# ── GitHub ──────────────────────────────────────────────────────────────────────────────────

_PAD_ID = re.compile(r"pad-(\d+)", re.I)


def _tickets(*texts):
    found = []
    for text in texts:
        for n in _PAD_ID.findall(text or ""):
            if f"PAD-{n}" not in found:
                found.append(f"PAD-{n}")
    return found


_CHECKS = {"SUCCESS": "success", "FAILURE": "failure", "ERROR": "failure", "PENDING": "pending",
           "EXPECTED": "pending"}

_CHECKS_QUERY = """
query Checks($owner: String!, $name: String!) {
  repository(owner: $owner, name: $name) {
    pullRequests(states: OPEN, first: 50) {
      nodes { number commits(last: 1) { nodes { commit { statusCheckRollup { state } } } } }
    }
  }
}
"""


def _github(config, now):
    repo = (config.get("WORK_GITHUB_REPO") or "").strip()
    if not repo:
        return {"status": "not_configured", "missing": "WORK_GITHUB_REPO"}
    token = (config.get("WORK_GITHUB_TOKEN") or "").strip()
    headers = {"Accept": "application/vnd.github+json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    base = f"{GITHUB_API}/repos/{repo}"
    since_iso = (now - timedelta(days=WINDOW_DAYS)).strftime("%Y-%m-%dT%H:%M:%SZ")

    def get(path):
        return _request("GET", f"{base}{path}", headers=headers)

    # Rule 3: a PR into staging is live once its merge commit is among main's commits.
    in_main = {c["sha"] for c in get(f"/commits?sha=main&since={since_iso}&per_page=100")}
    merged = []
    for target in ("staging", "main"):
        for pr in get(f"/pulls?state=closed&base={target}&sort=updated&direction=desc&per_page=100"):
            if not pr.get("merged_at") or pr["merged_at"] < since_iso:
                continue
            where = "production" if target == "main" or pr.get("merge_commit_sha") in in_main else "staging"
            merged.append({
                "number": pr["number"], "title": pr["title"], "url": pr["html_url"], "base": target,
                "mergedAt": pr["merged_at"], "where": where,
                "tickets": _tickets(pr["head"]["ref"], pr["title"]),
            })
    merged.sort(key=lambda p: p["mergedAt"], reverse=True)

    # Rule 5: check states need the token (GitHub's GraphQL API refuses anonymous calls).
    checks = {}
    if token:
        owner, name = repo.split("/", 1)
        answer = _request("POST", f"{GITHUB_API}/graphql", headers=headers,
                          json={"query": _CHECKS_QUERY, "variables": {"owner": owner, "name": name}})
        for node in answer["data"]["repository"]["pullRequests"]["nodes"]:
            commits = node["commits"]["nodes"]
            rollup = (commits[0]["commit"].get("statusCheckRollup") or {}) if commits else {}
            checks[node["number"]] = _CHECKS.get(rollup.get("state"))
    open_ = [
        {
            "number": pr["number"], "title": pr["title"], "url": pr["html_url"], "base": pr["base"]["ref"],
            "draft": bool(pr.get("draft")), "checks": checks.get(pr["number"]),
            "tickets": _tickets(pr["head"]["ref"], pr["title"]),
        }
        for pr in get("/pulls?state=open&per_page=100")
    ]

    deploys = {}
    for label, workflow in (("staging", "deploy-staging.yaml"), ("production", "deploy-prod.yaml")):
        runs = get(f"/actions/workflows/{workflow}/runs?per_page=5")["workflow_runs"]
        deploys[label] = [
            {"status": r.get("status"), "conclusion": r.get("conclusion"), "sha": (r.get("head_sha") or "")[:7],
             "createdAt": r.get("created_at"), "url": r.get("html_url")}
            for r in runs[:5]
        ]
    return {"status": "ok", "merged": merged, "open": open_, "deploys": deploys}


# ── the answer ──────────────────────────────────────────────────────────────────────────────

def _source(name, fn, config, now):
    try:
        answer = fn(config, now)
    except Exception as exc:  # noqa: BLE001 — one source down never hides the other (rule 1)
        # Rule 5: the exception class only; an HTTP error's text can repeat a request header.
        current_app.logger.warning("work dashboard: %s unavailable: %s", name, type(exc).__name__)
        return {"status": "unavailable", "lastOkAt": _cache.get(f"ok:{name}")}
    if answer["status"] == "ok":
        _cache[f"ok:{name}"] = now.strftime("%Y-%m-%dT%H:%M:%SZ")
    return answer


def work(config, *, refresh=False, clock=time.monotonic):
    """Rule 1: `{fetchedAt, linear, github}`, from the cache while it is fresh (rule 7)."""
    with _lock:
        tick = clock()
        cached = _cache.get("answer")
        fresh = cached is not None and tick - cached[0] < CACHE_SECONDS
        last_refresh = _cache.get("refreshedAt")
        may_refresh = last_refresh is None or tick - last_refresh >= REFRESH_EVERY_SECONDS
        if fresh and not (refresh and may_refresh):
            return cached[1]
        if fresh:
            _cache["refreshedAt"] = tick
        now = datetime.now(timezone.utc)
        answer = {
            "fetchedAt": now.strftime("%Y-%m-%dT%H:%M:%SZ"),
            "linear": _source("linear", _linear, config, now),
            "github": _source("github", _github, config, now),
        }
        _cache["answer"] = (tick, answer)
        return answer
