"""PAD-742 admin.finance rules 1, 2, 5, 5a, 5b, 6: who reaches finance, the audited manual writes,
the console audit log without money, and the owner-only history."""
import json
from datetime import date, datetime

from padel_app.sql_db import db
from padel_app.tests.admin_helpers import admin_token, audit_rows, bearer, make_role
from padel_app.tests.helpers import pin_clock

CLAUDE_MAX = {
    "category": "ai_tools",
    "vendor": "Anthropic",
    "description": "Claude Max",
    "currency": "USD",
    "amount": "200.00",
    "amountEur": "184.37",
    "recurrence": "monthly",
    "startsOn": "2026-07-03",
}


def _owner(app):
    return bearer(admin_token(app, make_role(app, "owner@levapp.app", "owner")))


def _create(client, headers, **overrides):
    return client.post("/admin/api/finance/costs", json={**CLAUDE_MAX, **overrides}, headers=headers)


def test_every_console_account_reaches_finance_and_nobody_else_does(app, client):
    # Owner's answer Q4 (2026-10-23): every admin account reads and writes; the audit names who.
    for n, role in enumerate(("support", "operator", "owner")):
        headers = bearer(admin_token(app, make_role(app, f"{role}@levapp.app", role)))
        assert client.get("/admin/api/finance/summary", headers=headers).status_code == 200
        created = client.post("/admin/api/finance/costs", json={**CLAUDE_MAX, "startsOn": f"2026-07-0{n + 1}"}, headers=headers)
        assert created.status_code == 201
        assert created.get_json()["createdByEmail"] == f"{role}@levapp.app"
    assert sorted(r["actorEmail"] for r in audit_rows(app, "finance.cost.create")) == [
        "operator@levapp.app", "owner@levapp.app", "support@levapp.app"
    ]
    assert client.get("/admin/api/finance/summary").status_code == 401


def test_a_manual_cost_is_created_audited_without_money_and_revised(app, client):
    headers = _owner(app)
    response = _create(client, headers)
    assert response.status_code == 201
    body = response.get_json()
    assert body["createdByEmail"] == "owner@levapp.app"
    assert (body["amount"], body["currency"], body["amountEur"]) == ("200.00", "USD", "184.37")
    (row,) = audit_rows(app, "finance.cost.create")
    assert row["outcome"] == "ok"
    assert (row["targetType"], row["targetId"]) == ("finance_cost", str(body["id"]))
    assert row["before"] is None
    assert set(row["after"]) == {"changedFields"}
    assert "amountEur" in row["after"]["changedFields"]
    values = json.dumps([row["before"], row["after"]])  # the request id is random hex: not searched
    assert "184.37" not in values and "Anthropic" not in values
    (revision,) = client.get(f"/admin/api/finance/costs/{body['id']}/revisions", headers=headers).get_json()["items"]
    assert (revision["revision"], revision["action"]) == (1, "create")
    assert revision["snapshot"]["amountEur"] == "184.37"


def test_a_euro_cost_with_a_different_euro_amount_is_refused(app, client):
    headers = _owner(app)
    response = _create(client, headers, currency="EUR", amount="10.00", amountEur="9.00", recurrence="once")
    assert response.status_code == 400
    assert response.get_json() == {"error": "INVALID_COST", "field": "amountEur"}
    from padel_app.models.finance import FinanceCost

    with app.app_context():
        assert FinanceCost.query.count() == 0


def test_a_euro_cost_copies_its_amount_when_no_euro_amount_is_given(app, client):
    response = _create(client, _owner(app), currency="EUR", amount="12.30", amountEur=None, recurrence="once")
    assert response.status_code == 201
    assert response.get_json()["amountEur"] == "12.30"


def test_invalid_fields_are_named(app, client):
    headers = _owner(app)
    cases = [
        ({"amount": "10.001"}, "amount"),
        ({"amount": "-1"}, "amount"),
        ({"currency": "usd"}, "currency"),
        ({"category": "travel"}, "category"),
        ({"recurrence": "weekly"}, "recurrence"),
        ({"vendor": "  "}, "vendor"),
        ({"endsOn": "2026-06-01"}, "endsOn"),
        ({"recurrence": "once", "endsOn": "2026-12-01"}, "endsOn"),
        ({"gcpInvoice": True}, "gcpInvoice"),
        ({"startsOn": "03/07/2026"}, "startsOn"),
    ]
    for overrides, field in cases:
        response = _create(client, headers, **overrides)
        assert response.status_code == 400, overrides
        assert response.get_json() == {"error": "INVALID_COST", "field": field}, overrides


def test_an_edit_keeps_the_old_value_in_finance_not_in_the_audit_log(app, client):
    headers = _owner(app)
    cost_id = _create(
        client, headers, currency="EUR", amount="99.00", amountEur="99.00", recurrence="once", startsOn="2026-08-10"
    ).get_json()["id"]
    response = client.put(
        f"/admin/api/finance/costs/{cost_id}", json={"amount": "119.00", "amountEur": "119.00", "notes": "renewal"},
        headers=headers,
    )
    assert response.status_code == 200
    assert response.get_json()["amountEur"] == "119.00"
    assert response.get_json()["updatedByEmail"] == "owner@levapp.app"
    revisions = client.get(f"/admin/api/finance/costs/{cost_id}/revisions", headers=headers).get_json()["items"]
    assert [(r["revision"], r["action"], r["snapshot"]["amountEur"]) for r in revisions] == [
        (2, "update", "119.00"), (1, "create", "99.00"),
    ]
    (row,) = audit_rows(app, "finance.cost.update")
    assert row["before"] is None
    assert row["after"] == {"changedFields": ["amount", "amountEur", "notes"]}
    text = json.dumps([row["before"], row["after"]])
    assert "99.00" not in text and "119" not in text and "renewal" not in text


def test_a_deleted_cost_stops_counting_but_stays_listed(app, client, monkeypatch):
    pin_clock(monkeypatch, datetime(2026, 10, 22, 12, 0))
    headers = _owner(app)
    keep = _create(client, headers, currency="EUR", amount="20.00", amountEur="20.00", recurrence="once",
                   startsOn="2026-08-01").get_json()["id"]
    gone = _create(client, headers, currency="EUR", amount="50.00", amountEur="50.00", recurrence="once",
                   startsOn="2026-08-10").get_json()["id"]
    august = lambda: next(m for m in client.get("/admin/api/finance/summary", headers=headers).get_json()["months"]
                          if m["month"] == "2026-08")
    assert august()["total"] == "70.00"
    response = client.delete(f"/admin/api/finance/costs/{gone}", headers=headers)
    assert response.status_code == 200
    assert response.get_json()["deletedAt"]
    assert august()["total"] == "20.00"
    listed = [c["id"] for c in client.get("/admin/api/finance/costs", headers=headers).get_json()["items"]]
    assert listed == [keep]
    with_deleted = client.get("/admin/api/finance/costs?includeDeleted=true", headers=headers).get_json()["items"]
    assert {c["id"] for c in with_deleted} == {keep, gone}
    (row,) = audit_rows(app, "finance.cost.delete")
    assert row["after"] == {"changedFields": ["deletedAt"]}
    assert client.put(f"/admin/api/finance/costs/{gone}", json={"notes": "x"}, headers=headers).status_code == 404


def test_a_gcp_invoice_is_refused_in_an_imported_month(app, client):
    from padel_app.models.finance import FinanceGcpCost

    headers = _owner(app)
    with app.app_context():
        db.session.add(FinanceGcpCost(invoice_month=date(2026, 9, 1), project_id="demo-project",
                                      service="Compute Engine", currency="EUR", cost=1, credits=0))
        db.session.commit()
    response = _create(client, headers, category="infrastructure", vendor="Google Cloud", description="Invoice",
                       currency="EUR", amount="31.00", amountEur="31.00", recurrence="once", startsOn="2026-09-30",
                       gcpInvoice=True)
    assert response.status_code == 409
    assert response.get_json() == {"error": "GCP_MONTH_IMPORTED"}


def test_every_finance_audit_row_carries_no_values(app, client):
    """Rule 5a guard: after a create, an update, a delete and a denied call, no finance.* audit row
    holds any key other than changedFields and runId."""
    headers = _owner(app)
    cost_id = _create(client, headers).get_json()["id"]
    client.put(f"/admin/api/finance/costs/{cost_id}", json={"notes": "n"}, headers=headers)
    client.delete(f"/admin/api/finance/costs/{cost_id}", headers=headers)
    rows = [r for r in audit_rows(app) if r["action"].startswith("finance.")]
    assert len(rows) == 3
    for row in rows:
        assert row["before"] is None
        assert set(row["after"] or {}) <= {"changedFields", "runId"}
