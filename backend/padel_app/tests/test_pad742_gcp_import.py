"""PAD-742 admin.finance rules 2, 7, 8, 9: the daily read-only Google Cloud billing import.

BigQuery is never called: a fake session records the REST requests and answers with the shape of
`jobs.query` (schema + rows of `f`/`v` cells). Every id here is invented (R-036)."""
from datetime import date, datetime, timedelta
from decimal import Decimal

import pytest

from padel_app.sql_db import db
from padel_app.tests.admin_helpers import admin_token, audit_rows, bearer, make_role
from padel_app.tests.helpers import pin_clock

TABLE = "demo-project.billing_export.gcp_billing_export_v1_TEST"
NOW = datetime(2026, 10, 5, 4, 7)


class _Response:
    def __init__(self, status, body):
        self.status_code = status
        self._body = body
        self.text = str(body)

    def json(self):
        return self._body


class FakeSession:
    def __init__(self, rows=(), status=200, error=None, pages=None):
        self.requests = []
        self.rows = list(rows)
        self.status = status
        self.error = error
        self.pages = pages

    def post(self, url, json=None, timeout=None):
        self.requests.append(("POST", url, json))
        if self.status != 200:
            return _Response(self.status, {"error": {"message": self.error or "denied"}})
        if self.pages:
            return _Response(200, {"jobComplete": True, "rows": self.pages[0], "pageToken": "p2",
                                   "jobReference": {"jobId": "job1", "location": "EU"}})
        return _Response(200, {"jobComplete": True, "rows": [_row(*r) for r in self.rows],
                               "jobReference": {"jobId": "job1", "location": "EU"}})

    def get(self, url, params=None, timeout=None):
        self.requests.append(("GET", url, params))
        return _Response(200, {"jobComplete": True, "rows": self.pages[1]})


def _row(month, project, service, currency, cost, credits):
    return {"f": [{"v": v} for v in (month, project, service, currency, cost, credits)]}


@pytest.fixture
def configured(app):
    app.config["FINANCE_GCP_BILLING_TABLE"] = TABLE
    app.config["FINANCE_GCP_MAX_BYTES"] = 1024 ** 3
    yield
    app.config["FINANCE_GCP_BILLING_TABLE"] = ""


def _run(app, session, trigger="schedule", now=NOW):
    from padel_app.services.admin import finance_gcp_import

    with app.app_context():
        run = finance_gcp_import.run_import(trigger, now=now, session_factory=lambda: session)
        return run.to_dict()


def _lines(app):
    from padel_app.models.finance import FinanceGcpCost

    with app.app_context():
        return sorted(
            (r.invoice_month.isoformat()[:7], r.project_id, r.service, Decimal(r.cost), Decimal(r.credits))
            for r in FinanceGcpCost.query.all()
        )


def _seed_line(app, month, service="Old", cost="1"):
    from padel_app.models.finance import FinanceGcpCost

    with app.app_context():
        db.session.add(FinanceGcpCost(invoice_month=month, project_id="demo-project", service=service,
                                      currency="EUR", cost=cost, credits=0))
        db.session.commit()


def test_the_import_replaces_the_two_open_months_and_leaves_older_ones(app, configured):
    _seed_line(app, date(2026, 8, 1), "Kept")
    _seed_line(app, date(2026, 9, 1), "Outdated")
    session = FakeSession([("202609", "demo-project", "Compute Engine", "EUR", "40.123456", "-5.000000")])
    run = _run(app, session)
    assert run["outcome"] == "ok" and run["rows"] == 1
    assert run["months"] == ["2026-09", "2026-10"]
    expected = [
        ("2026-08", "demo-project", "Kept", Decimal("1"), Decimal("0")),
        ("2026-09", "demo-project", "Compute Engine", Decimal("40.123456"), Decimal("-5.000000")),
    ]
    assert _lines(app) == expected
    assert _run(app, FakeSession(session.rows))["outcome"] == "ok"
    assert _lines(app) == expected


def test_the_query_is_bounded_and_read_only(app, configured):
    session = FakeSession()
    _run(app, session)
    ((method, url, body),) = session.requests
    assert method == "POST" and url.endswith("/projects/demo-project/queries")
    assert body["maximumBytesBilled"] == str(1024 ** 3)
    assert body["useLegacySql"] is False
    params = {p["name"]: p["parameterValue"]["value"] for p in body["queryParameters"]}
    assert params == {"since": "2026-09-01", "prev": "202609", "curr": "202610"}
    query = body["query"]
    assert query.lstrip().upper().startswith("SELECT")
    assert f"`{TABLE}`" in query and "_PARTITIONTIME >= TIMESTAMP(@since)" in query
    for verb in ("INSERT", "UPDATE", "DELETE", "MERGE", "DROP", "CREATE"):
        assert verb not in query.upper()


def test_every_page_is_read(app, configured):
    session = FakeSession(pages=[
        [_row("202610", "demo-project", "A", "EUR", "1.000000", "0")],
        [_row("202610", "demo-project", "B", "EUR", "2.000000", "0")],
    ])
    assert _run(app, session)["rows"] == 2
    assert session.requests[1][0] == "GET" and session.requests[1][2]["pageToken"] == "p2"


def test_an_unconfigured_import_says_so(app, client):
    from padel_app.services.admin import finance_gcp_import

    session = FakeSession()
    assert _run(app, session)["outcome"] == "not_configured"
    assert session.requests == []
    with app.app_context():
        assert finance_gcp_import.import_status(NOW)["configured"] is False


def test_a_failing_import_is_visible_and_keeps_the_old_figures(app, configured, caplog):
    from padel_app.services.admin import finance_gcp_import

    _seed_line(app, date(2026, 9, 1), "Kept")
    run = _run(app, FakeSession(status=403, error="Access Denied: Table demo-project:billing_export"))
    assert (run["outcome"], run["errorCode"]) == ("error", "PERMISSION_DENIED")
    assert "Access Denied" in run["errorMessage"]
    assert [line[2] for line in _lines(app)] == ["Kept"]
    assert any("finance_gcp_import failed" in r.getMessage() for r in caplog.records)
    with app.app_context():
        assert finance_gcp_import.import_status(NOW)["lastRun"]["outcome"] == "error"
    assert _run(app, FakeSession(status=404))["errorCode"] == "TABLE_NOT_FOUND"


def test_a_stale_import_is_visible(app, configured):
    from padel_app.services.admin import finance_gcp_import

    _run(app, FakeSession(), now=NOW)
    with app.app_context():
        from padel_app.models.finance import FinanceImportRun

        run = FinanceImportRun.query.one()
        run.finished_at = NOW
        db.session.commit()
        assert finance_gcp_import.import_status(NOW + timedelta(hours=35))["stale"] is False
        assert finance_gcp_import.import_status(NOW + timedelta(hours=37))["stale"] is True


def test_a_stuck_run_reports_an_error(app, configured):
    from padel_app.models.finance import FinanceImportRun
    from padel_app.services.admin import finance_gcp_import

    with app.app_context():
        db.session.add(FinanceImportRun(trigger="schedule", started_at=NOW, outcome="running", rows=0))
        db.session.commit()
        status = finance_gcp_import.import_status(NOW + timedelta(minutes=31))
        assert (status["lastRun"]["outcome"], status["lastRun"]["errorCode"]) == ("error", "STUCK")


def test_a_non_euro_billing_account_is_refused(app, configured):
    run = _run(app, FakeSession([("202610", "demo-project", "Compute Engine", "USD", "3.000000", "0")]))
    assert (run["outcome"], run["errorCode"]) == ("error", "BILLING_CURRENCY_NOT_EUR")
    assert _lines(app) == []


def test_a_malformed_table_id_never_reaches_bigquery(app, configured):
    app.config["FINANCE_GCP_BILLING_TABLE"] = "demo-project.billing`; DROP TABLE x; --"
    session = FakeSession()
    run = _run(app, session)
    assert (run["outcome"], run["errorCode"]) == ("error", "BIGQUERY_ERROR")
    assert session.requests == []


def test_run_now_is_audited_and_refuses_a_parallel_run(app, client, monkeypatch):
    from padel_app.models.finance import FinanceImportRun

    pin_clock(monkeypatch, NOW)
    headers = bearer(admin_token(app, make_role(app, "owner@levapp.app", "owner")))
    with app.app_context():
        live = FinanceImportRun(trigger="schedule", started_at=NOW - timedelta(minutes=5), outcome="running", rows=0)
        db.session.add(live)
        db.session.commit()
        live_id = live.id
    response = client.post("/admin/api/finance/gcp/import", headers=headers)
    assert response.status_code == 409
    assert response.get_json() == {"error": "IMPORT_RUNNING"}
    with app.app_context():
        row = db.session.get(FinanceImportRun, live_id)
        row.outcome = "ok"
        row.finished_at = NOW
        db.session.commit()
    response = client.post("/admin/api/finance/gcp/import", headers=headers)
    assert response.status_code == 200
    body = response.get_json()
    assert (body["trigger"], body["actorEmail"], body["outcome"]) == ("manual", "owner@levapp.app", "not_configured")
    ok_rows = [r for r in audit_rows(app, "finance.gcp.import") if r["outcome"] == "ok"]
    assert len(ok_rows) == 1
    assert ok_rows[0]["after"] == {"changedFields": [], "runId": body["id"]}
    runs = client.get("/admin/api/finance/import-runs", headers=headers).get_json()["items"]
    assert runs[0]["id"] == body["id"]


def test_the_month_view_lists_lines_with_net(app, client):
    headers = bearer(admin_token(app, make_role(app, "owner@levapp.app", "owner")))
    from padel_app.models.finance import FinanceGcpCost

    with app.app_context():
        db.session.add(FinanceGcpCost(invoice_month=date(2026, 9, 1), project_id="demo-project",
                                      service="Compute Engine", currency="EUR", cost="40.123456",
                                      credits="-5.000000"))
        db.session.commit()
    body = client.get("/admin/api/finance/gcp?month=2026-09", headers=headers).get_json()
    assert body["month"] == "2026-09"
    assert body["items"] == [{"projectId": "demo-project", "service": "Compute Engine", "currency": "EUR",
                              "cost": "40.12", "credits": "-5.00", "net": "35.12"}]


def test_the_job_is_a_fixed_daily_singleton():
    from padel_app import scheduler
    from padel_app.services.admin import engine_health

    assert ("finance_gcp_import", 4, 7) in scheduler.DAILY_JOBS
    assert scheduler._daily_job_funcs()["finance_gcp_import"] is scheduler._run_finance_gcp_import
    assert "finance_gcp_import" in engine_health.SINGLETONS


def test_the_byte_cap_falls_back_to_one_gib():
    from padel_app.config import finance_max_bytes

    assert finance_max_bytes("5000") == 5000
    for raw in (None, "", "0", "-3", "1e9", "lots"):
        assert finance_max_bytes(raw) == 1024 ** 3, raw
