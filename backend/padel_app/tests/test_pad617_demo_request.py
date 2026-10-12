"""PAD-617 — auth.landing-page rule 10: the site's "Pedir demonstração" form posts to our own
`POST /api/public/demo-request`, which validates it and forwards it to HubSpot's public Forms API
v3. The browser never talks to HubSpot and no token is involved. Spam protection: a honeypot, a
minimum time to fill, a per-IP rate limit, and HubSpot's own filter. Without a configured form id
the endpoint answers 503 and the dialog falls back to the email address.

HubSpot is never called: `demo_request_service._post` is replaced (R-008).
"""
import logging

import pytest

from padel_app.services import demo_request_service

FORM_ID = "11111111-2222-3333-4444-555555555555"


class _Calls(list):
    """The forwarded posts; `.res` is the response HubSpot gives (tests change its status)."""


@pytest.fixture
def hubspot(app, monkeypatch):
    app.config["HUBSPOT_DEMO_FORM_ID"] = FORM_ID
    calls = _Calls()

    class Res:
        status_code = 200
        text = "{}"

    def fake_post(url, json, timeout):
        calls.append({"url": url, "json": json, "timeout": timeout})
        return Res()

    monkeypatch.setattr(demo_request_service, "_post", fake_post)
    calls.res = Res
    return calls


def body(**over):
    b = {
        "fullname": "Rita  Pereira Lopes",
        "email": "rita@academia.pt",
        "phone": "+351 912 345 678",
        "company": "Academia Norte",
        "city": "Porto",
        "alunos": 30,
        "horas": 20,
        "message": "Gostava de ver as avaliações.",
        "consent": True,
        "pedido": "demonstracao",
        "hutk": "0123456789abcdef0123456789abcdef",
        "pageUri": "https://levapp.app/?para=treinadores",
        "pageName": "LevApp",
        "website": "",
        "elapsedMs": 12000,
    }
    b.update(over)
    return b


def post(client, payload, ip="203.0.113.9"):
    return client.post("/api/public/demo-request", json=payload, headers={"X-Real-IP": ip})


def test_a_valid_request_is_forwarded_to_the_hubspot_form(client, hubspot):
    res = post(client, body())
    assert res.status_code == 200, res.get_json()
    assert res.get_json() == {"ok": True}
    [call] = hubspot
    assert call["url"] == f"https://api.hsforms.com/submissions/v3/integration/submit/149443437/{FORM_ID}"
    sent = {f["name"]: f["value"] for f in call["json"]["fields"]}
    assert sent == {
        "firstname": "Rita",
        "lastname": "Pereira Lopes",
        "email": "rita@academia.pt",
        "phone": "+351 912 345 678",
        "company": "Academia Norte",
        "city": "Porto",
        "levapp_num_alunos": "30",
        "levapp_horas_aulas_semana": "20",
        "message": "Gostava de ver as avaliações.",
        "levapp_funcao": "treinador",
        "levapp_pedido_site": "demonstracao",
        "levapp_canal_origem": "site",
        "levapp_tipo_origem": "inbound",
    }
    assert call["json"]["context"] == {
        "hutk": "0123456789abcdef0123456789abcdef",
        "pageUri": "https://levapp.app/?para=treinadores",
        "pageName": "LevApp",
        "ipAddress": "203.0.113.9",
    }
    consent = call["json"]["legalConsentOptions"]["consent"]
    assert consent["consentToProcess"] is True and "Política de Privacidade" in consent["text"]


def test_the_free_month_request_is_told_apart_and_the_message_is_optional(client, hubspot):
    res = post(client, body(pedido="mes_gratis", message="", hutk=None))
    assert res.status_code == 200, res.get_json()
    sent = {f["name"]: f["value"] for f in hubspot[0]["json"]["fields"]}
    assert sent["levapp_pedido_site"] == "mes_gratis"
    assert "message" not in sent
    assert "hutk" not in hubspot[0]["json"]["context"]


@pytest.mark.parametrize(
    "over, field",
    [
        ({"fullname": "R"}, "fullname"),
        ({"email": "not-an-email"}, "email"),
        ({"phone": "123"}, "phone"),
        ({"company": ""}, "company"),
        ({"city": " "}, "city"),
        ({"alunos": 0}, "alunos"),
        ({"horas": "lots"}, "horas"),
        ({"consent": False}, "consent"),
        ({"pedido": "other"}, "pedido"),
        ({"message": "x" * 2001}, "message"),
    ],
)
def test_an_invalid_field_is_refused_and_nothing_is_sent(client, hubspot, over, field):
    res = post(client, body(**over))
    assert res.status_code == 400, res.get_json()
    assert res.get_json()["field"] == field
    assert hubspot == []


def test_a_filled_honeypot_is_answered_as_success_and_dropped(client, hubspot):
    res = post(client, body(website="http://spam.example"))
    assert res.status_code == 200 and res.get_json() == {"ok": True}
    assert hubspot == []


def test_a_form_filled_in_under_three_seconds_is_dropped(client, hubspot):
    res = post(client, body(elapsedMs=900))
    assert res.status_code == 200 and res.get_json() == {"ok": True}
    assert hubspot == []


def test_without_a_form_id_the_endpoint_is_unavailable(client, app, hubspot):
    app.config["HUBSPOT_DEMO_FORM_ID"] = ""
    res = post(client, body())
    assert res.status_code == 503
    assert res.get_json()["code"] == "DEMO_UNAVAILABLE"
    assert hubspot == []


@pytest.mark.parametrize("status", [400, 404, 500])
def test_a_hubspot_refusal_is_a_502_and_logs_no_personal_data(client, hubspot, status, caplog):
    hubspot.res.status_code = status
    with caplog.at_level(logging.WARNING, logger="padel_app.services.demo_request_service"):
        res = post(client, body())
    assert res.status_code == 502
    assert res.get_json()["code"] == "DEMO_FAILED"
    logged = " ".join(r.getMessage() for r in caplog.records)
    assert str(status) in logged
    assert "rita@academia.pt" not in logged and "912" not in logged


def test_hubspot_unreachable_is_a_502(client, app, monkeypatch):
    app.config["HUBSPOT_DEMO_FORM_ID"] = FORM_ID

    def boom(url, json, timeout):
        raise ConnectionError("down")

    monkeypatch.setattr(demo_request_service, "_post", boom)
    res = post(client, body())
    assert res.status_code == 502


def test_requests_are_rate_limited_per_ip(client, app, hubspot):
    app.config["AUTH_RATE_LIMIT_ENABLED"] = True
    app.config["AUTH_RATE_LIMIT_DEMO"] = "3/3600"
    for _ in range(3):
        assert post(client, body(), ip="198.51.100.7").status_code == 200
    res = post(client, body(), ip="198.51.100.7")
    assert res.status_code == 429
    assert res.get_json()["error"] == "RATE_LIMITED"
    assert post(client, body(), ip="198.51.100.8").status_code == 200
    assert len(hubspot) == 4


# ── review round ────────────────────────────────────────────────────────────

def test_a_bot_that_fills_the_honeypot_learns_nothing_even_with_invalid_fields(client, hubspot):
    res = post(client, {"website": "http://spam.example", "email": "nope"})
    assert res.status_code == 200 and res.get_json() == {"ok": True}
    assert hubspot == []


def test_a_body_that_is_not_an_object_is_a_400(client, hubspot):
    res = client.post("/api/public/demo-request", json=[1, 2], headers={"X-Real-IP": "203.0.113.20"})
    assert res.status_code == 400
    assert hubspot == []


def test_an_oversized_body_is_refused_before_parsing(client, hubspot):
    res = post(client, body(message="x" * 20000))
    assert res.status_code == 413
    assert hubspot == []


def test_a_malformed_hutk_or_page_is_not_forwarded(client, hubspot):
    res = post(client, body(hutk="<script>", pageUri="javascript:alert(1)", pageName="P" * 300))
    assert res.status_code == 200, res.get_json()
    context = hubspot[0]["json"]["context"]
    assert "hutk" not in context and "pageUri" not in context
    assert len(context["pageName"]) == 100
