"""admin.work-dashboard (PAD-555, v2 PAD-646): tickets from Linear; pull requests, deploys, the bug
ledger and CI lane timing from GitHub; TestFlight builds from App Store Connect. For the staff console.
Read-only; the tokens and the App Store Connect key stay here (rules 5, 9).

Each source is answered on its own (rule 1): `ok`, `not_configured` (a setting is missing) or
`unavailable` (it could not be reached). The whole answer is cached in this process for 5 minutes,
and a forced refresh is honoured at most once a minute (rule 7).
"""
from __future__ import annotations

import base64
import re
import statistics
import threading
import time
from datetime import datetime, timedelta, timezone

from flask import current_app

LINEAR_URL = "https://api.linear.app/graphql"
GITHUB_API = "https://api.github.com"
TEAM_KEY = "PAD"
WINDOW_DAYS = 30
CACHE_SECONDS = 300
#: An answer with a source down is kept only briefly, so a passing timeout is not shown for 5 minutes.
DEGRADED_CACHE_SECONDS = 30
REFRESH_EVERY_SECONDS = 60
#: Page caps; reaching one marks the section `truncated` instead of dropping rows silently.
LINEAR_PAGES = 3
GITHUB_PAGES = 5
TIMEOUT_SECONDS = 10
SUMMARY_MAX = 200
ASC_API = "https://api.appstoreconnect.apple.com"
#: Rule 9: App Store Connect tokens may live at most 20 minutes.
ASC_TOKEN_SECONDS = 20 * 60
ASC_SETTINGS = ("ASC_KEY_ID", "ASC_ISSUER_ID", "ASC_PRIVATE_KEY", "ASC_APP_ID")
ASC_BUILDS = 10
#: Rule 10: the ledger index, read on staging (where every ticket's ledger entry lands first).
BUGS_INDEX = ".cortex/compass/bugs/_index.md"
BUG_CLOSED = frozenset({"resolved", "wontfix", "duplicate"})
SEVERITY_ORDER = ("critical", "high", "medium", "low")
#: Rule 11: the CI workflows whose lanes are timed; runs read for the failure rate, runs timed.
CI_WORKFLOWS = ("backend-tests.yaml", "checks-frontend.yaml", "e2e-subset.yaml", "admin-e2e.yaml",
                "android-build.yaml")
CI_RUNS = 10
CI_TIMED_RUNS = 5
#: GitHub's own job limit when a workflow sets none.
GITHUB_DEFAULT_TIMEOUT = 360
NEAR_LIMIT = 0.8

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

_LINEAR_OPEN = """
query Open($after: String) {
  open: issues(first: 100, after: $after, filter: {team: {key: {eq: "%(team)s"}},
               state: {type: {in: ["backlog", "unstarted", "started"]}}}) {
    nodes { identifier title description priority url createdAt
            state { name type } assignee { name } }
    pageInfo { hasNextPage endCursor }
  }
}
""" % {"team": TEAM_KEY}

_LINEAR_DONE = """
query Done($since: DateTimeOrDuration!, $after: String) {
  done: issues(first: 100, after: $after, filter: {team: {key: {eq: "%(team)s"}}, completedAt: {gte: $since}}) {
    nodes { identifier title url completedAt state { name } }
    pageInfo { hasNextPage endCursor }
  }
}
""" % {"team": TEAM_KEY}


def _linear_nodes(key, query, field, variables):
    """Every node of one Linear connection, up to LINEAR_PAGES pages; (nodes, truncated)."""
    nodes, after = [], None
    for _ in range(LINEAR_PAGES):
        answer = _request("POST", LINEAR_URL, headers={"Authorization": key, "Content-Type": "application/json"},
                          json={"query": query, "variables": {**variables, "after": after}})
        if answer.get("errors") or not answer.get("data"):
            raise RuntimeError("linear answered errors")
        page = answer["data"][field]
        nodes.extend(page["nodes"])
        info = page.get("pageInfo") or {}
        if not info.get("hasNextPage"):
            return nodes, False
        after = info.get("endCursor")
    return nodes, True

#: In progress first, then to do, then backlog; within each, Linear's priority 1 (urgent) … 4 (low),
#: and 0 (no priority) last.
_STATE_ORDER = {"started": 0, "unstarted": 1, "backlog": 2}


def _linear(config, now):
    key = (config.get("LINEAR_API_KEY") or "").strip()
    if not key:
        return {"status": "not_configured", "missing": "LINEAR_API_KEY"}
    since = (now - timedelta(days=WINDOW_DAYS)).strftime("%Y-%m-%dT%H:%M:%SZ")
    open_nodes, open_truncated = _linear_nodes(key, _LINEAR_OPEN, "open", {})
    done_nodes, done_truncated = _linear_nodes(key, _LINEAR_DONE, "done", {"since": since})
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
        for n in open_nodes
    ]
    open_.sort(key=lambda t: (_STATE_ORDER.get(t["stateType"], 3), t["priority"] or 5, t["createdAt"] or ""))
    done = [
        {"id": n["identifier"], "title": n["title"], "completedAt": n.get("completedAt"), "url": n.get("url")}
        for n in done_nodes
        if (n.get("completedAt") or "") >= since
    ]
    done.sort(key=lambda t: t["completedAt"] or "", reverse=True)
    return {"status": "ok", "open": open_, "done": done,
            "truncated": {"open": open_truncated, "done": done_truncated}}


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
    pullRequests(states: OPEN, first: 100) {
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

    # Rule 3: a PR into staging is live unless its merge commit is still among the commits staging has
    # and main does not (promotions are merge commits, so the SHAs survive the staging → main merge).
    ahead = get("/compare/main...staging?per_page=250")
    only_on_staging = {c["sha"] for c in ahead.get("commits", [])}
    merged, merged_truncated = [], False
    for target in ("staging", "main"):
        for page in range(1, GITHUB_PAGES + 1):
            rows = get(f"/pulls?state=closed&base={target}&sort=updated&direction=desc&per_page=100&page={page}")
            for pr in rows:
                if not pr.get("merged_at") or pr["merged_at"] < since_iso:
                    continue
                if target == "main" and pr["head"]["ref"] == "staging":
                    continue  # the promotion is the release of the PRs it carries, not a change of its own
                staging_only = target == "staging" and pr.get("merge_commit_sha") in only_on_staging
                merged.append({
                    "number": pr["number"], "title": pr["title"], "url": pr["html_url"], "base": target,
                    "mergedAt": pr["merged_at"], "where": "staging" if staging_only else "production",
                    "tickets": _tickets(pr["head"]["ref"], pr["title"]),
                })
            # Sorted by last update: a page that ends before the window is the last one needed.
            last = rows[-1].get("updated_at") if rows else None
            if len(rows) < 100 or (last and last < since_iso):
                break
        else:
            merged_truncated = True
    merged.sort(key=lambda p: p["mergedAt"], reverse=True)

    # Rule 5: check states need the token (GitHub's GraphQL API refuses anonymous calls).
    checks = {}
    if token:
        # The check states are extra: a GraphQL error (HTTP 200 with `errors`) or a revoked token
        # leaves them unknown, never the rest of GitHub.
        try:
            owner, name = repo.split("/", 1)
            answer = _request("POST", f"{GITHUB_API}/graphql", headers=headers,
                              json={"query": _CHECKS_QUERY, "variables": {"owner": owner, "name": name}})
            for node in answer["data"]["repository"]["pullRequests"]["nodes"]:
                commits = node["commits"]["nodes"]
                rollup = (commits[0]["commit"].get("statusCheckRollup") or {}) if commits else {}
                checks[node["number"]] = _CHECKS.get(rollup.get("state"))
        except Exception as exc:  # noqa: BLE001
            current_app.logger.warning("work dashboard: check states unavailable: %s", type(exc).__name__)
            checks = {}
    open_ = [
        {
            "number": pr["number"], "title": pr["title"], "url": pr["html_url"], "base": pr["base"]["ref"],
            "draft": bool(pr.get("draft")), "checks": checks.get(pr["number"]),
            "tickets": _tickets(pr["head"]["ref"], pr["title"]),
        }
        for pr in get("/pulls?state=open&per_page=100")
    ]
    open_truncated = len(open_) >= 100

    deploys = {}
    for label, workflow in (("staging", "deploy-staging.yaml"), ("production", "deploy-prod.yaml")):
        runs = get(f"/actions/workflows/{workflow}/runs?per_page=5")["workflow_runs"]
        deploys[label] = [
            {"status": r.get("status"), "conclusion": r.get("conclusion"), "sha": (r.get("head_sha") or "")[:7],
             "createdAt": r.get("created_at"), "url": r.get("html_url")}
            for r in runs[:5]
        ]
    return {"status": "ok", "merged": merged, "open": open_, "deploys": deploys,
            "truncated": {"merged": merged_truncated, "open": open_truncated}}


# ── TestFlight (rule 9) ─────────────────────────────────────────────────────────────────────

def _asc_token(config, now):
    """A 20-minute ES256 token for App Store Connect, signed with the team's API key (never logged)."""
    import jwt

    pem = config["ASC_PRIVATE_KEY"].strip().replace("\\n", "\n")  # a secret stored on one line
    issued = int(now.timestamp())
    return jwt.encode({"iss": config["ASC_ISSUER_ID"].strip(), "iat": issued,
                       "exp": issued + ASC_TOKEN_SECONDS, "aud": "appstoreconnect-v1"},
                      pem, algorithm="ES256", headers={"kid": config["ASC_KEY_ID"].strip(), "typ": "JWT"})


def _testflight(config, now):
    for name in ASC_SETTINGS:
        if not (config.get(name) or "").strip():
            return {"status": "not_configured", "missing": name}
    url = (f"{ASC_API}/v1/builds?filter[app]={config['ASC_APP_ID'].strip()}&sort=-uploadedDate&limit={ASC_BUILDS}"
           "&include=preReleaseVersion,buildBetaDetail,betaBuildLocalizations"
           "&fields[builds]=version,uploadedDate,processingState,expired,preReleaseVersion,buildBetaDetail,betaBuildLocalizations"
           "&fields[preReleaseVersions]=version,platform"
           "&fields[buildBetaDetails]=internalBuildState,externalBuildState"
           "&fields[betaBuildLocalizations]=locale,whatsNew")
    answer = _request("GET", url, headers={"Authorization": f"Bearer {_asc_token(config, now)}"})
    included = {(i["type"], i["id"]): i.get("attributes") or {} for i in answer.get("included", [])}

    def related(build, name):
        data = ((build.get("relationships") or {}).get(name) or {}).get("data")
        if isinstance(data, list):
            data = data[0] if data else None
        return included.get((data["type"], data["id"]), {}) if data else {}

    builds = []
    for build in answer.get("data", []):
        attrs = build.get("attributes") or {}
        beta = related(build, "buildBetaDetail")
        builds.append({
            "build": attrs.get("version"), "version": related(build, "preReleaseVersion").get("version"),
            "uploadedAt": attrs.get("uploadedDate"), "processingState": attrs.get("processingState"),
            "expired": bool(attrs.get("expired")), "internalState": beta.get("internalBuildState"),
            "externalState": beta.get("externalBuildState"),
            "whatToTest": summary(related(build, "betaBuildLocalizations").get("whatsNew")),
        })
    return {"status": "ok", "builds": builds}


# ── open bugs (rule 10) ─────────────────────────────────────────────────────────────────────

_BUG_LINE = re.compile(r"^- \[(B-\d+)\]\(([^)]+)\)\s+—\s+(.*)\(([^()]*)\)\s*$")


def _github_headers(config):
    headers = {"Accept": "application/vnd.github+json"}
    token = (config.get("WORK_GITHUB_TOKEN") or "").strip()
    if token:
        headers["Authorization"] = f"Bearer {token}"
    return headers


def _file_on_staging(repo, path, headers):
    """A text file on `staging`, through the contents API (base64 in a JSON answer)."""
    answer = _request("GET", f"{GITHUB_API}/repos/{repo}/contents/{path}?ref=staging", headers=headers)
    return base64.b64decode(answer["content"]).decode("utf-8")


def _bugs(config, now):
    repo = (config.get("WORK_GITHUB_REPO") or "").strip()
    if not repo:
        return {"status": "not_configured", "missing": "WORK_GITHUB_REPO"}
    text = _file_on_staging(repo, BUGS_INDEX, _github_headers(config))
    open_, counts, resolved, unparsed = [], {}, 0, 0
    for line in text.splitlines():
        if not line.startswith("- [B-"):
            continue
        match = _BUG_LINE.match(line.strip())
        parts = [p.strip() for p in match.group(4).split(",")] if match else []
        if len(parts) < 3:
            unparsed += 1
            continue
        bug_id, file, title = match.group(1), match.group(2), match.group(3).strip()
        kind, severity, status = parts[0], parts[1].lower(), (parts[2].split() or [""])[0].lower()
        if status in BUG_CLOSED:
            resolved += status == "resolved"
            continue
        counts[severity] = counts.get(severity, 0) + 1
        open_.append({"id": bug_id, "title": title, "type": kind, "severity": severity, "status": status,
                      "url": f"https://github.com/{repo}/blob/staging/.cortex/compass/bugs/{file}"})
    rank = {name: i for i, name in enumerate(SEVERITY_ORDER)}
    open_.sort(key=lambda b: (rank.get(b["severity"], len(rank)), int(b["id"].split("-")[1])))
    return {"status": "ok", "open": open_, "counts": {"open": counts, "resolved": resolved}, "unparsed": unparsed}


# ── CI lanes (rule 11) ──────────────────────────────────────────────────────────────────────

_JOB_ID = re.compile(r"^  ([A-Za-z0-9_-]+):\s*$")
_JOB_NAME = re.compile(r"^    name:\s*(.+?)\s*$")
_JOB_TIMEOUT = re.compile(r"^    timeout-minutes:\s*(\d+)\s*$")


def job_timeouts(workflow_text):
    """Rule 11: `{job name (as GitHub shows it, a matrix name keeps its ${{ }}): minutes}` from a
    workflow file. Only job-level keys (4-space indent under `jobs:`) count; a step's own
    `timeout-minutes` is deeper and ignored. Unset is GitHub's 360."""
    limits, in_jobs, current = {}, False, None
    for line in workflow_text.splitlines():
        if line.startswith("jobs:"):
            in_jobs = True
            continue
        if in_jobs and line and not line.startswith(" ") and not line.startswith("#"):
            in_jobs = False
        if not in_jobs:
            continue
        job = _JOB_ID.match(line)
        if job:
            current = {"name": job.group(1), "minutes": GITHUB_DEFAULT_TIMEOUT}
            limits[id(current)] = current
            continue
        if current is None:
            continue
        name = _JOB_NAME.match(line)
        if name:
            current["name"] = name.group(1).strip("'\"")
        minutes = _JOB_TIMEOUT.match(line)
        if minutes:
            current["minutes"] = int(minutes.group(1))
    return {job["name"]: job["minutes"] for job in limits.values()}


def _timeout_for(job_name, limits):
    if job_name in limits:
        return limits[job_name]
    for template, minutes in limits.items():
        if "${{" in template:
            pattern = "^" + ".*".join(re.escape(part) for part in re.split(r"\$\{\{.*?\}\}", template)) + "$"
            if re.match(pattern, job_name):
                return minutes
    return GITHUB_DEFAULT_TIMEOUT


def _minutes(job):
    try:
        started = datetime.fromisoformat(job["started_at"].replace("Z", "+00:00"))
        completed = datetime.fromisoformat(job["completed_at"].replace("Z", "+00:00"))
    except (KeyError, TypeError, ValueError, AttributeError):
        return None
    return round((completed - started).total_seconds() / 60)


def _ci(config, now):
    repo = (config.get("WORK_GITHUB_REPO") or "").strip()
    if not repo:
        return {"status": "not_configured", "missing": "WORK_GITHUB_REPO"}
    if not (config.get("WORK_GITHUB_TOKEN") or "").strip():
        return {"status": "not_configured", "missing": "WORK_GITHUB_TOKEN"}
    headers = _github_headers(config)
    base = f"{GITHUB_API}/repos/{repo}"
    workflows = []
    for workflow in CI_WORKFLOWS:
        limits = job_timeouts(_file_on_staging(repo, f".github/workflows/{workflow}", headers))
        runs = _request("GET", f"{base}/actions/workflows/{workflow}/runs?status=completed&per_page={CI_RUNS}",
                        headers=headers).get("workflow_runs", [])[:CI_RUNS]
        counted = [r for r in runs if r.get("conclusion") not in ("cancelled", "skipped")]
        failed = [r for r in counted if r.get("conclusion") in ("failure", "timed_out")]
        timings: dict[str, list[int]] = {}
        for run in runs[:CI_TIMED_RUNS]:
            jobs = _request("GET", f"{base}/actions/runs/{run['id']}/jobs?per_page=100", headers=headers).get("jobs", [])
            for job in jobs:
                if job.get("conclusion") in ("cancelled", "skipped", None):
                    continue
                minutes = _minutes(job)
                if minutes is not None:
                    timings.setdefault(job["name"], []).append(minutes)
        lanes = []
        for name, minutes in timings.items():
            limit = _timeout_for(name, limits)
            longest = max(minutes)
            lanes.append({"name": name, "latestMinutes": minutes[0], "medianMinutes": round(statistics.median(minutes)),
                          "longestMinutes": longest, "timeoutMinutes": limit, "nearLimit": longest >= NEAR_LIMIT * limit})
        lanes.sort(key=lambda lane: lane["longestMinutes"] / lane["timeoutMinutes"], reverse=True)
        workflows.append({"workflow": workflow, "runs": len(counted),
                          "failureRate": round(len(failed) / len(counted), 2) if counted else None,
                          "lanes": lanes})
    return {"status": "ok", "workflows": workflows}


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


#: Rule 1: every source, answered on its own, in the answer's order.
SOURCES = {"linear": _linear, "github": _github, "testflight": _testflight, "bugs": _bugs, "ci": _ci}


def work(config, *, refresh=False):
    """Rule 1: `{fetchedAt, linear, github}`, from the cache while it is fresh (rule 7).

    The cache is per process, which is the whole backend under R-027 (one gunicorn worker). The lock
    is held across the outside calls, so concurrent openers wait for one fetch rather than each
    making their own; at a handful of staff users that wait is the cheaper trade.
    """
    with _lock:
        tick = time.monotonic()
        cached = _cache.get("answer")
        degraded = cached is not None and any(cached[1][k]["status"] == "unavailable" for k in SOURCES)
        lifetime = DEGRADED_CACHE_SECONDS if degraded else CACHE_SECONDS
        fresh = cached is not None and tick - cached[0] < lifetime
        last_fetch = _cache.get("fetchedAtTick")
        may_refresh = last_fetch is None or tick - last_fetch >= REFRESH_EVERY_SECONDS
        if fresh and not (refresh and may_refresh):
            return cached[1]
        _cache["fetchedAtTick"] = tick
        now = datetime.now(timezone.utc)
        answer = {
            "fetchedAt": now.strftime("%Y-%m-%dT%H:%M:%SZ"),
            **{name: _source(name, fn, config, now) for name, fn in SOURCES.items()},
        }
        _cache["answer"] = (tick, answer)
        return answer
