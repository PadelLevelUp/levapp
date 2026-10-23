"""PAD-742 admin.finance rule 10: the CSV has one line per charge and sums to the summary."""
import csv
import io
from datetime import date, datetime
from decimal import Decimal

from padel_app.sql_db import db
from padel_app.tests.admin_helpers import admin_token, bearer, make_role
from padel_app.tests.helpers import pin_clock


def test_the_csv_matches_the_summary(app, client, monkeypatch):
    from padel_app.models.finance import FinanceCost, FinanceGcpCost

    pin_clock(monkeypatch, datetime(2026, 10, 22, 12, 0))
    headers = bearer(admin_token(app, make_role(app, "owner@levapp.app", "owner")))
    with app.app_context():
        common = dict(vendor="Anthropic", description="Claude Max", created_by_email="o@levapp.app",
                      updated_by_email="o@levapp.app")
        db.session.add(FinanceCost(category="ai_tools", currency="USD", amount="200.00", amount_eur="184.37",
                                   recurrence="monthly", starts_on=date(2026, 7, 3), **common))
        db.session.add(FinanceCost(category="email_crm", currency="EUR", amount="10.00", amount_eur="10.00",
                                   recurrence="monthly", starts_on=date(2026, 5, 1), ends_on=date(2026, 8, 31),
                                   **common))
        db.session.add(FinanceGcpCost(invoice_month=date(2026, 9, 1), project_id="demo-project",
                                      service="Compute Engine", currency="EUR", cost="40.123456",
                                      credits="-5.000000"))
        db.session.commit()
    response = client.get("/admin/api/finance/export.csv?from=2026-07&to=2026-10", headers=headers)
    assert response.status_code == 200
    assert response.mimetype == "text/csv"
    assert 'filename="levapp-custos-2026-07-2026-10.csv"' in response.headers["Content-Disposition"]
    text = response.get_data(as_text=True)
    assert text.startswith("﻿")
    rows = list(csv.DictReader(io.StringIO(text.lstrip("﻿"))))
    # 4 Claude Max months, 2 email months (Jul, Aug), 1 imported line.
    assert len(rows) == 7
    assert {r["currency"] for r in rows if r["category"] == "ai_tools"} == {"USD"}
    summary = client.get("/admin/api/finance/summary?from=2026-07&to=2026-10", headers=headers).get_json()
    assert sum(Decimal(r["amount_eur"]) for r in rows) == sum(Decimal(m["total"]) for m in summary["months"])
