"""PAD-742 admin.finance rules 3, 4, 6, 10: the month × category summary and its running total."""
from datetime import date, datetime

from padel_app.sql_db import db
from padel_app.tests.admin_helpers import admin_token, bearer, make_role
from padel_app.tests.helpers import pin_clock

NOW = datetime(2026, 10, 22, 12, 0)


def _owner(app):
    return bearer(admin_token(app, make_role(app, "owner@levapp.app", "owner")))


def _cost(app, category="other", amount="10.00", recurrence="once", starts_on=date(2026, 1, 15), ends_on=None,
          gcp_invoice=False):
    from padel_app.models.finance import FinanceCost

    with app.app_context():
        row = FinanceCost(category=category, vendor="V", description="D", currency="EUR", amount=amount,
                          amount_eur=amount, recurrence=recurrence, starts_on=starts_on, ends_on=ends_on,
                          gcp_invoice=gcp_invoice, created_by_email="owner@levapp.app",
                          updated_by_email="owner@levapp.app")
        db.session.add(row)
        db.session.commit()
        return row.id


def _gcp(app, month, cost, credits="0", service="Compute Engine"):
    from padel_app.models.finance import FinanceGcpCost

    with app.app_context():
        db.session.add(FinanceGcpCost(invoice_month=month, project_id="demo-project", service=service,
                                      currency="EUR", cost=cost, credits=credits))
        db.session.commit()


def _summary(client, headers, query=""):
    return client.get(f"/admin/api/finance/summary{query}", headers=headers).get_json()


def test_recurring_costs_charge_every_period_until_they_end(app, client, monkeypatch):
    pin_clock(monkeypatch, NOW)
    headers = _owner(app)
    _cost(app, "ai_tools", "184.37", "monthly", date(2026, 7, 3))
    _cost(app, "stores", "99.00", "annual", date(2025, 11, 20))
    _cost(app, "email_crm", "10.00", "monthly", date(2026, 5, 1), ends_on=date(2026, 8, 31))
    body = _summary(client, headers)
    months = {m["month"]: m["byCategory"] for m in body["months"]}
    assert body["start"] == "2025-11"
    assert list(months)[0] == "2025-11" and list(months)[-1] == "2026-10"
    assert [k for k, v in months.items() if "ai_tools" in v] == ["2026-07", "2026-08", "2026-09", "2026-10"]
    assert {v["ai_tools"] for v in months.values() if "ai_tools" in v} == {"184.37"}
    assert [k for k, v in months.items() if "stores" in v] == ["2025-11"]
    assert [k for k, v in months.items() if "email_crm" in v] == ["2026-05", "2026-06", "2026-07", "2026-08"]
    assert months["2026-03"] == {}


def test_the_cumulative_total_runs_from_the_start_whatever_the_window(app, client, monkeypatch):
    pin_clock(monkeypatch, NOW)
    headers = _owner(app)
    _cost(app, amount="100.00", starts_on=date(2026, 1, 5))
    _cost(app, amount="50.00", starts_on=date(2026, 2, 5))
    _cost(app, amount="25.00", starts_on=date(2026, 3, 5))
    body = _summary(client, headers, "?from=2026-02&to=2026-03")
    assert body["start"] == "2026-01"
    assert [(m["month"], m["total"], m["cumulative"]) for m in body["months"]] == [
        ("2026-02", "50.00", "150.00"), ("2026-03", "25.00", "175.00"),
    ]


def test_imported_google_cloud_counts_its_net_in_infrastructure(app, client, monkeypatch):
    pin_clock(monkeypatch, NOW)
    headers = _owner(app)
    _gcp(app, date(2026, 9, 1), "40.123456", "-5.000000")
    _gcp(app, date(2026, 9, 1), "0.004000", service="Cloud Storage")
    (september,) = [m for m in _summary(client, headers)["months"] if m["month"] == "2026-09"]
    assert september["byCategory"] == {"infrastructure": "35.13"}  # 35.127456 rounded once, after summing


def test_google_cloud_is_counted_once(app, client, monkeypatch):
    pin_clock(monkeypatch, NOW)
    headers = _owner(app)
    manual = _cost(app, "infrastructure", "31.00", starts_on=date(2026, 8, 31), gcp_invoice=True)
    _cost(app, "infrastructure", "12.00", starts_on=date(2026, 7, 31), gcp_invoice=True)
    _gcp(app, date(2026, 8, 1), "30.50")
    body = _summary(client, headers)
    months = {m["month"]: m for m in body["months"]}
    assert months["2026-08"]["byCategory"] == {"infrastructure": "30.50"}
    assert months["2026-07"]["byCategory"] == {"infrastructure": "12.00"}
    assert body["superseded"] == [{"costId": manual, "month": "2026-08"}]


def test_no_costs_means_no_months(app, client, monkeypatch):
    pin_clock(monkeypatch, NOW)
    body = _summary(client, _owner(app))
    assert body["start"] is None and body["months"] == []
    assert body["importStatus"]["configured"] is False


def test_a_bad_month_is_refused(app, client):
    response = client.get("/admin/api/finance/summary?from=2026-13", headers=_owner(app))
    assert response.status_code == 400
    assert response.get_json() == {"error": "INVALID_MONTH", "field": "from"}
