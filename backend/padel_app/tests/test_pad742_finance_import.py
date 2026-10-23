"""PAD-742 admin.finance rule 5c: the initial list is loaded from a CSV or a pasted table, with the
form's validation, a dry-run preview, all-or-nothing, and one audit row per created cost."""
import json

from padel_app.tests.admin_helpers import admin_token, audit_rows, bearer, make_role

URL = "/admin/api/finance/costs/import"
CSV = (
    "category,vendor,description,currency,amount,amountEur,recurrence,startsOn,endsOn,gcpInvoice,notes\n"
    "ai_tools,Anthropic,Claude Max (1),USD,200.00,184.37,monthly,2026-01-03,,,\n"
    "ai_tools,Anthropic,Claude Max (2),USD,200.00,184.37,monthly,2026-03-10,,,second founder\n"
    "stores,Apple,Developer Program,EUR,99.00,,annual,2026-02-01,,,\n"
)


def _headers(app, role="support"):
    return bearer(admin_token(app, make_role(app, f"{role}@levapp.app", role)))


def _costs(app):
    from padel_app.models.finance import FinanceCost

    with app.app_context():
        return FinanceCost.query.count()


def test_a_dry_run_previews_every_line_and_writes_nothing(app, client):
    response = client.post(URL, json={"text": CSV, "dryRun": True}, headers=_headers(app))
    assert response.status_code == 200
    body = response.get_json()
    assert body["dryRun"] is True and body["invalid"] == 0
    assert [line["line"] for line in body["lines"]] == [2, 3, 4]
    apple = body["lines"][2]["cost"]
    assert (apple["vendor"], apple["amount"], apple["amountEur"], apple["recurrence"]) == ("Apple", "99.00", "99.00", "annual")
    assert body["lines"][1]["cost"]["notes"] == "second founder"
    assert _costs(app) == 0
    (row,) = audit_rows(app, "finance.cost.import")
    assert row["after"] == {"changedFields": []}


def test_the_import_creates_every_line_with_one_audit_row_each(app, client):
    headers = _headers(app, "operator")
    response = client.post(URL, json={"text": CSV, "dryRun": False}, headers=headers)
    assert response.status_code == 201
    ids = response.get_json()["created"]
    assert len(ids) == 3 and _costs(app) == 3
    rows = audit_rows(app, "finance.cost.create")
    assert sorted(int(r["targetId"]) for r in rows) == sorted(ids)
    assert {r["actorEmail"] for r in rows} == {"operator@levapp.app"}
    assert all(set(r["after"]) == {"changedFields"} for r in rows)
    assert "184.37" not in json.dumps([[r["before"], r["after"]] for r in rows])  # rule 5a
    revisions = client.get(f"/admin/api/finance/costs/{ids[0]}/revisions", headers=headers).get_json()["items"]
    assert [r["action"] for r in revisions] == ["create"]
    summary = client.get("/admin/api/finance/summary?from=2026-03&to=2026-03", headers=headers).get_json()
    assert summary["months"][0]["byCategory"]["ai_tools"] == "368.74"


def test_one_bad_line_names_its_line_and_field_and_nothing_is_created(app, client):
    text = CSV + "domains_dns,Cloudflare,levapp.app,EUR,-10,,annual,2026-04-01,,,\n"
    headers = _headers(app)
    preview = client.post(URL, json={"text": text}, headers=headers).get_json()
    assert preview["dryRun"] is True and preview["invalid"] == 1
    assert preview["lines"][3] == {"line": 5, "ok": False, "error": "INVALID_COST", "field": "amount"}
    response = client.post(URL, json={"text": text, "dryRun": False}, headers=headers)
    assert response.status_code == 400
    assert response.get_json()["error"] == "IMPORT_INVALID"
    assert _costs(app) == 0
    assert audit_rows(app, "finance.cost.create") == []


def test_a_pasted_table_with_semicolons_tabs_and_decimal_commas_is_read(app, client):
    headers = _headers(app)
    pasted = "Category\tVendor\tDescription\tCurrency\tAmount\tRecurrence\tStartsOn\n" \
             "stores\tGoogle\tPlay Console\tusd\t25,00\tonce\t2026-02-14\n"
    (tab,) = client.post(URL, json={"text": pasted}, headers=headers).get_json()["lines"]
    assert tab["ok"] is False and tab["field"] == "amountEur"  # USD needs the euro amount
    semicolons = "﻿category;vendor;description;currency;amount;recurrence;startsOn;gcpInvoice\n" \
                 "infrastructure;Google Cloud;Invoice 2026-01;EUR;12,34;once;2026-01-31;sim\n"
    (line,) = client.post(URL, json={"text": semicolons}, headers=headers).get_json()["lines"]
    assert line["ok"] is True
    assert (line["cost"]["amount"], line["cost"]["gcpInvoice"]) == ("12.34", True)


def test_a_line_already_entered_or_repeated_is_refused_as_a_duplicate(app, client):
    headers = _headers(app)
    assert client.post(URL, json={"text": CSV, "dryRun": False}, headers=headers).status_code == 201
    again = client.post(URL, json={"text": CSV}, headers=headers).get_json()
    assert again["invalid"] == 3
    assert {line["error"] for line in again["lines"]} == {"DUPLICATE_COST"}
    header, first = CSV.splitlines()[:2]
    new = first.replace("(1)", "(3)")
    twice = client.post(URL, json={"text": "\n".join([header, new, new])}, headers=headers).get_json()
    assert [line["ok"] for line in twice["lines"]] == [True, False]


def test_a_bad_header_or_an_empty_text_is_refused(app, client):
    headers = _headers(app)
    unknown = client.post(URL, json={"text": "category,vendor,price\n"}, headers=headers)
    assert unknown.status_code == 400 and unknown.get_json() == {"error": "IMPORT_BAD_HEADER", "field": "price"}
    missing = client.post(URL, json={"text": "category,vendor,description,currency,amount,recurrence\n"}, headers=headers)
    assert missing.get_json() == {"error": "IMPORT_BAD_HEADER", "field": "startsOn"}
    assert client.post(URL, json={"text": "  \n"}, headers=headers).get_json() == {"error": "IMPORT_EMPTY"}


def test_a_signed_out_caller_cannot_import(app, client):
    assert client.post(URL, json={"text": CSV, "dryRun": False}).status_code == 401
    assert _costs(app) == 0
