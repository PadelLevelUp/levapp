"""admin.finance (PAD-742) rules 7–9: the daily read-only import of Google Cloud's billing export.

The Cloud Billing API has no endpoint that returns spend, so the figures come from the standard
usage cost export in BigQuery, read with one parameterised query over BigQuery's REST `jobs.query`
through google-auth (no BigQuery client library). Each run replaces the stored lines of the previous
and current invoice months and records itself in `finance_import_runs`; a failure keeps the old
lines and is visible on the finance page and in the logs, never silent.

The table id is configuration (`FINANCE_GCP_BILLING_TABLE`), never a tracked value (R-036).
"""
import re
from datetime import date, timedelta
from decimal import Decimal

from flask import current_app

from padel_app.models.finance import FinanceGcpCost, FinanceImportRun
from padel_app.sql_db import db
from padel_app.utils.dates import to_utc_iso, utcnow_naive

SCOPE = "https://www.googleapis.com/auth/bigquery.readonly"
API = "https://bigquery.googleapis.com/bigquery/v2/projects"
TABLE_ID = re.compile(r"^([a-z][a-z0-9-]{4,61}[a-z0-9])\.([A-Za-z0-9_]{1,1024})\.([A-Za-z0-9_]{1,1024})$")
RUNNING_FOR_AT_MOST = timedelta(minutes=30)
STALE_AFTER = timedelta(hours=36)
MAX_PAGES = 50
#: Rule 7: no single query bills more than this (1 GiB, about €0.006 at on-demand prices).
DEFAULT_MAX_BYTES = 1024 ** 3
QUERY_TIMEOUT_MS = 60000


class ImportRunning(Exception):
    """Rule 8: another run is still `running` and under 30 minutes old."""


class _Failed(Exception):
    def __init__(self, code, message):
        super().__init__(message)
        self.code = code
        self.message = message


def _months(now):
    current = date(now.year, now.month, 1)
    previous = (current - timedelta(days=1)).replace(day=1)
    return previous, current


def _key(month):
    return f"{month.year:04d}-{month.month:02d}"


def _yyyymm(month):
    return f"{month.year:04d}{month.month:02d}"


def build_query(table):
    """The one query a run sends (rule 7). Identifiers can't be query parameters, so the table id is
    checked against the shape of a BigQuery table id and backtick-quoted."""
    if not TABLE_ID.match(table):
        raise _Failed("BIGQUERY_ERROR", "FINANCE_GCP_BILLING_TABLE is not project.dataset.table")
    return (
        "SELECT invoice.month AS m, project.id AS p, service.description AS s, currency AS c, "
        "SUM(cost) AS cost, "
        "SUM(IFNULL((SELECT SUM(x.amount) FROM UNNEST(credits) x), 0)) AS credits "
        f"FROM `{table}` "
        "WHERE _PARTITIONTIME >= TIMESTAMP(@since) AND invoice.month IN (@prev, @curr) "
        "GROUP BY m, p, s, c"
    )


def query_body(table, previous, current, max_bytes):
    def param(name, value):
        return {"name": name, "parameterType": {"type": "STRING"}, "parameterValue": {"value": value}}

    return {
        "query": build_query(table),
        "useLegacySql": False,
        "parameterMode": "NAMED",
        "queryParameters": [
            param("since", previous.isoformat()),
            param("prev", _yyyymm(previous)),
            param("curr", _yyyymm(current)),
        ],
        "maximumBytesBilled": str(max_bytes),
        "timeoutMs": QUERY_TIMEOUT_MS,
    }


def _default_session():
    import google.auth
    from google.auth.transport.requests import AuthorizedSession

    credentials, _project = google.auth.default(scopes=[SCOPE])
    return AuthorizedSession(credentials)


def _check(response):
    if response.status_code < 300:
        return response.json()
    try:
        message = (response.json().get("error") or {}).get("message") or response.text
    except ValueError:
        message = response.text
    code = {403: "PERMISSION_DENIED", 404: "TABLE_NOT_FOUND"}.get(response.status_code, "BIGQUERY_ERROR")
    raise _Failed(code, f"HTTP {response.status_code}: {message}")


def _fetch(session, project, body):
    """Every result row of the query, following the job until it completes and every page."""
    payload = _check(session.post(f"{API}/{project}/queries", json=body, timeout=90))
    rows = list(payload.get("rows") or [])
    job = payload.get("jobReference") or {}
    pages = 0
    while not payload.get("jobComplete", False) or payload.get("pageToken"):
        pages += 1
        if pages > MAX_PAGES or not job.get("jobId"):
            raise _Failed("BIGQUERY_ERROR", "the query did not complete")
        params = {"timeoutMs": QUERY_TIMEOUT_MS}
        if job.get("location"):
            params["location"] = job["location"]
        if payload.get("pageToken"):
            params["pageToken"] = payload["pageToken"]
        payload = _check(session.get(f"{API}/{project}/queries/{job['jobId']}", params=params, timeout=90))
        if payload.get("jobComplete", False):
            rows.extend(payload.get("rows") or [])
    return rows


def _lines(rows):
    """The query's rows as (month, project, service, currency, cost, credits)."""
    out = []
    for row in rows:
        m, p, s, c, cost, credits = (cell.get("v") for cell in row["f"])
        month = date(int(m[:4]), int(m[4:6]), 1)
        out.append(
            (month, (p or "(none)")[:64], (s or "(none)")[:120], c or "", Decimal(cost or "0"), Decimal(credits or "0"))
        )
    return out


def _running(now):
    return (
        FinanceImportRun.query.filter(
            FinanceImportRun.outcome == "running",
            FinanceImportRun.started_at > now - RUNNING_FOR_AT_MOST,
        ).first()
    )


def run_import(trigger, actor_email=None, now=None, session_factory=None):
    """One import (rule 7). The run row commits on its own, so a failure is always recorded.
    Raises ImportRunning when another run is live (rule 8); returns the finished run."""
    now = now or utcnow_naive()
    if _running(now) is not None:
        raise ImportRunning()
    previous, current = _months(now)
    run = FinanceImportRun(
        trigger=trigger, actor_email=actor_email, started_at=now, outcome="running",
        months=[_key(previous), _key(current)], rows=0,
    )
    db.session.add(run)
    db.session.commit()
    table = (current_app.config.get("FINANCE_GCP_BILLING_TABLE") or "").strip()
    if not table:
        run.outcome = "not_configured"
        run.finished_at = utcnow_naive()
        db.session.commit()
        return run
    try:
        body = query_body(table, previous, current, current_app.config.get("FINANCE_GCP_MAX_BYTES") or DEFAULT_MAX_BYTES)
        session = (session_factory or _default_session)()
        lines = _lines(_fetch(session, table.split(".", 1)[0], body))
        foreign = sorted({line[3] for line in lines if line[3] != "EUR"})
        if foreign:
            raise _Failed("BILLING_CURRENCY_NOT_EUR", f"billing currency {', '.join(foreign)}, not EUR")
        FinanceGcpCost.query.filter(FinanceGcpCost.invoice_month.in_((previous, current))).delete(
            synchronize_session=False
        )
        for month, project, service, currency, cost, credits in lines:
            db.session.add(
                FinanceGcpCost(
                    invoice_month=month, project_id=project, service=service, currency=currency,
                    cost=cost, credits=min(credits, Decimal("0")), run_id=run.id,
                )
            )
        run.outcome = "ok"
        run.rows = len(lines)
        run.finished_at = utcnow_naive()
        db.session.commit()
    except Exception as exc:  # noqa: BLE001 — every failure ends the run visibly (rule 7)
        db.session.rollback()
        failed = exc if isinstance(exc, _Failed) else _Failed("BIGQUERY_ERROR", f"{type(exc).__name__}: {exc}")
        run = db.session.get(FinanceImportRun, run.id)
        run.outcome = "error"
        run.error_code = failed.code
        run.error_message = (failed.message or "")[:500]
        run.finished_at = utcnow_naive()
        db.session.commit()
        current_app.logger.error("finance_gcp_import failed: %s %s", failed.code, run.error_message)
    return run


def import_status(now=None):
    """Rule 9: what the finance page shows at the top."""
    now = now or utcnow_naive()
    configured = bool((current_app.config.get("FINANCE_GCP_BILLING_TABLE") or "").strip())
    last = FinanceImportRun.query.order_by(FinanceImportRun.started_at.desc(), FinanceImportRun.id.desc()).first()
    last_ok = (
        FinanceImportRun.query.filter_by(outcome="ok")
        .order_by(FinanceImportRun.started_at.desc(), FinanceImportRun.id.desc())
        .first()
    )
    last_run = None
    if last is not None:
        outcome, error_code = last.outcome, last.error_code
        if outcome == "running" and last.started_at <= now - RUNNING_FOR_AT_MOST:
            outcome, error_code = "error", "STUCK"
        last_run = {
            "outcome": outcome,
            "startedAt": to_utc_iso(last.started_at),
            "finishedAt": to_utc_iso(last.finished_at) if last.finished_at else None,
            "errorCode": error_code,
        }
    last_ok_at = (last_ok.finished_at or last_ok.started_at) if last_ok else None
    return {
        "configured": configured,
        "lastRun": last_run,
        "lastOkAt": to_utc_iso(last_ok_at) if last_ok_at else None,
        "stale": configured and (last_ok_at is None or last_ok_at < now - STALE_AFTER),
    }


def recent_runs(limit=30):
    rows = FinanceImportRun.query.order_by(FinanceImportRun.started_at.desc(), FinanceImportRun.id.desc()).limit(limit)
    return [r.to_dict() for r in rows]


def month_lines(month):
    rows = FinanceGcpCost.query.filter_by(invoice_month=month).order_by(
        FinanceGcpCost.project_id, FinanceGcpCost.service
    )
    out = []
    for r in rows:
        cost, credits = Decimal(r.cost), Decimal(r.credits)
        out.append(
            {
                "projectId": r.project_id,
                "service": r.service,
                "currency": r.currency,
                "cost": f"{cost:.2f}",
                "credits": f"{credits:.2f}",
                "net": f"{cost + credits:.2f}",
            }
        )
    return out
