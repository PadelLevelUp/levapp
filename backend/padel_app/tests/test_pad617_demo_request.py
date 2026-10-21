"""PAD-617 — auth.landing-page rule 10: the site's "Pedir demonstração" form posts to our own
`POST /api/public/demo-request`, which validates it and forwards it to HubSpot's public Forms API
v3. The browser never talks to HubSpot and no token is involved. Spam protection: a honeypot, a
minimum time to fill, a per-IP rate limit, and HubSpot's own filter. Without a configured form id
the endpoint answers 503 and the dialog falls back to the email address.

PAD-650 reshaped the form to the live HubSpot form "Vamos falar!": first and last name, phone
(normalised), email, `clube_atual`, three qualification questions sent by internal value, the
consent texts verbatim and, when a marketing subscription id is configured, the optional
communications consent.

HubSpot is never called: `demo_request_service._post` is replaced (R-008).
"""
import json
import logging
from pathlib import Path

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


SUBSCRIPTION_ID = "12345"


def body(**over):
    b = {
        "firstname": " Rita ",
        "lastname": "Pereira  Lopes",
        "phone": "912 345 678",
        "email": "rita@academia.pt",
        "clube": "Academia Norte",
        "gestao": ["ferramentas_classicas", "ninguem_trata"],
        "lembretes": "diariamente",
        "tempo": "mais_3h",
        "consent": True,
        "marketing": True,
        "pedido": "demonstracao",
        "lang": "pt",
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


CONSENT_PT = "Aceito que a LevApp guarde e trate os meus dados pessoais para responder a este pedido."
MARKETING_PT = (
    "Opcional: quero receber em primeira mão promoções e novas funcionalidades da LevApp. "
    "Podes cancelar a qualquer momento."
)


def fields_of(call):
    return {f["name"]: f["value"] for f in call["json"]["fields"]}


def test_a_valid_request_is_forwarded_to_the_hubspot_form(client, app, hubspot):
    app.config["HUBSPOT_MARKETING_SUBSCRIPTION_ID"] = SUBSCRIPTION_ID
    res = post(client, body())
    assert res.status_code == 200, res.get_json()
    assert res.get_json() == {"ok": True}
    [call] = hubspot
    assert call["url"] == (
        f"https://api-eu1.hsforms.com/submissions/v3/integration/submit/149443437/{FORM_ID}"
    )
    assert fields_of(call) == {
        "firstname": "Rita",
        "lastname": "Pereira Lopes",
        "phone": "+351 912 345 678",
        "email": "rita@academia.pt",
        "clube_atual": "Academia Norte",
        "levapp_gestao_atual": "ferramentas_classicas;ninguem_trata",
        "levapp_lembretes_presenca": "diariamente",
        "levapp_tempo_gestao": "mais_3h",
        "levapp_tipo_origem": "inbound",
        "levapp_canal_origem": "site",
        "levapp_pedido_site": "demonstracao",
    }
    assert call["json"]["context"] == {
        "hutk": "0123456789abcdef0123456789abcdef",
        "pageUri": "https://levapp.app/?para=treinadores",
        "pageName": "LevApp",
        "ipAddress": "203.0.113.9",
    }
    assert call["json"]["legalConsentOptions"] == {
        "consent": {
            "consentToProcess": True,
            "text": CONSENT_PT,
            "communications": [
                {"value": True, "subscriptionTypeId": 12345, "text": MARKETING_PT},
            ],
        }
    }


def test_an_unticked_marketing_box_is_sent_as_false(client, app, hubspot):
    app.config["HUBSPOT_MARKETING_SUBSCRIPTION_ID"] = SUBSCRIPTION_ID
    assert post(client, body(marketing=False)).status_code == 200
    [comm] = hubspot[0]["json"]["legalConsentOptions"]["consent"]["communications"]
    assert comm["value"] is False


def test_without_a_subscription_id_no_communications_are_sent(client, app, hubspot):
    app.config["HUBSPOT_MARKETING_SUBSCRIPTION_ID"] = ""
    assert post(client, body(marketing=True)).status_code == 200
    consent = hubspot[0]["json"]["legalConsentOptions"]["consent"]
    assert consent == {"consentToProcess": True, "text": CONSENT_PT}


def test_without_a_pedido_no_button_is_recorded(client, hubspot):
    payload = body(hutk=None)
    del payload["pedido"]
    assert post(client, payload).status_code == 200, hubspot
    sent = fields_of(hubspot[0])
    assert "levapp_pedido_site" not in sent
    assert "company" not in sent
    assert "hutk" not in hubspot[0]["json"]["context"]


@pytest.mark.parametrize(
    "typed, sent",
    [
        ("912345678", "+351 912 345 678"),
        ("+351 912 345 678", "+351 912 345 678"),
        ("00351 96-123-4567", "+351 961 234 567"),
        ("+44 7700 900123", "+44 7700 900123"),
    ],
)
def test_the_phone_is_normalised(client, hubspot, typed, sent):
    assert post(client, body(phone=typed)).status_code == 200
    assert fields_of(hubspot[0])["phone"] == sent


def test_the_english_page_sends_the_english_consent_text(client, app, hubspot):
    app.config["HUBSPOT_MARKETING_SUBSCRIPTION_ID"] = SUBSCRIPTION_ID
    assert post(client, body(lang="en")).status_code == 200
    consent = hubspot[0]["json"]["legalConsentOptions"]["consent"]
    assert consent["text"] == demo_request_service.CONSENT_TEXTS["en"]
    assert consent["communications"][0]["text"] == demo_request_service.MARKETING_TEXTS["en"]


LOCALES = Path(__file__).resolve().parents[3] / "frontend" / "src" / "locales"


@pytest.mark.parametrize("lang", ["pt", "en"])
def test_the_texts_sent_are_the_texts_the_form_shows(lang):
    """The consent texts are the proof of consent, so the server's copy must be the screen's."""
    demo = json.loads((LOCALES / lang / "landing.json").read_text())["landing"]["demo"]
    assert demo["consent"] == demo_request_service.CONSENT_TEXTS[lang]
    assert demo["marketing"] == demo_request_service.MARKETING_TEXTS[lang]
    assert demo_request_service.CONSENT_TEXTS["pt"] == CONSENT_PT
    assert demo_request_service.MARKETING_TEXTS["pt"] == MARKETING_PT


@pytest.mark.parametrize(
    "over, field",
    [
        ({"firstname": ""}, "firstname"),
        ({"lastname": " "}, "lastname"),
        ({"email": "not-an-email"}, "email"),
        ({"phone": "123"}, "phone"),
        ({"phone": "812345678"}, "phone"),
        ({"phone": "+351 212 345 678"}, "phone"),
        ({"clube": ""}, "clube"),
        ({"gestao": []}, "gestao"),
        ({"gestao": ["ferramentas_classicas", "excel"]}, "gestao"),
        ({"gestao": "ferramentas_classicas"}, "gestao"),
        ({"lembretes": "Diariamente"}, "lembretes"),
        ({"tempo": None}, "tempo"),
        ({"consent": False}, "consent"),
        ({"pedido": "other"}, "pedido"),
        ({"firstname": "x" * 201}, "firstname"),
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
    assert "rita@academia.pt" not in logged and "912" not in logged and "Academia" not in logged


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
    res = post(client, body(pageName="x" * 20000))
    assert res.status_code == 413
    assert hubspot == []


def test_a_malformed_hutk_or_page_is_not_forwarded(client, hubspot):
    res = post(client, body(hutk="<script>", pageUri="javascript:alert(1)", pageName="P" * 300))
    assert res.status_code == 200, res.get_json()
    context = hubspot[0]["json"]["context"]
    assert "hutk" not in context and "pageUri" not in context
    assert len(context["pageName"]) == 100
