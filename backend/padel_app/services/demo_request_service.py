"""auth.landing-page rule 10 (PAD-617, PAD-650): the site's contact request, relayed to HubSpot.

The browser posts the form to `POST /api/public/demo-request`; this module validates it and
forwards it to HubSpot's public Forms API v3 (`submit/{portal}/{formGuid}`), which needs no token.
The browser never talks to HubSpot. The form's GUID is deployment config
(`HUBSPOT_DEMO_FORM_ID`, from the GitHub repo variable); without it the request answers 503 and
the dialog offers the email address instead.

Spam protection: a honeypot field (`website`) and a minimum time to fill (`elapsedMs`), both
answered as a success and dropped, before any validation, so a bot learns nothing about the form.
They only deter naive bots (`elapsedMs` is the client's word); the real defences are the per-IP
rate limit on the route and HubSpot's own filter. Failures are logged with the step and HTTP status only, never the
visitor's data.
"""
import logging
import re

import requests
from flask import current_app

logger = logging.getLogger(__name__)

#: Public by design (it is in every page that embeds HubSpot); see the web app's hubspotConfig.ts.
HUBSPOT_PORTAL_ID = "149443437"
#: The portal is in HubSpot's EU data centre. HubSpot's docs name only api.hsforms.com; both hosts
#: reached the form in the PAD-650 probe (2026-10-14), and the EU one keeps the request in the EU.
SUBMIT_URL = "https://api-eu1.hsforms.com/submissions/v3/integration/submit/{portal}/{form}"
TIMEOUT_S = 10
MIN_FILL_MS = 3000
PEDIDOS = ("demonstracao", "mes_gratis")
#: The qualification questions: request key → (HubSpot property, the CRM's internal values).
#: Values exactly as the CRM's enumeration options (PAD-650); the screen shows labels only.
GESTAO = ("levapp_gestao_atual", ("ferramentas_classicas", "clube_outro_treinador", "ninguem_trata", "outro"))
LEMBRETES = ("levapp_lembretes_presenca", ("diariamente", "semanalmente", "nao_envia"))
TEMPO = ("levapp_tempo_gestao", ("menos_1h", "1_3h", "mais_3h"))
#: The consent texts are the proof of consent, so they are sent exactly as the form shows them
#: (the web locale files hold the same strings; a backend test compares them).
CONSENT_TEXTS = {
    "pt": "Aceito que a LevApp guarde e trate os meus dados pessoais para responder a este pedido.",
    "en": "I agree that LevApp may store and process my personal data to answer this request.",
}
MARKETING_TEXTS = {
    "pt": (
        "Opcional: quero receber em primeira mão promoções e novas funcionalidades da LevApp. "
        "Podes cancelar a qualquer momento."
    ),
    "en": (
        "Optional: I want to be the first to hear about LevApp's offers and new features. "
        "You can unsubscribe at any time."
    ),
}
_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
#: HubSpot's visitor cookie is 32 hex characters; anything else is not forwarded.
_HUTK_RE = re.compile(r"^[0-9a-f]{32}$")
#: A Portuguese mobile number, with or without the country code, once spaces and dashes are gone.
_PT_MOBILE_RE = re.compile(r"^(?:\+351|00351)?(9\d{8})$")
_INTL_RE = re.compile(r"^\+\d{8,15}$")


class DemoRequestError(Exception):
    def __init__(self, status, code, field=None):
        super().__init__(code)
        self.status = status
        self.code = code
        self.field = field


def _post(url, json, timeout):
    return requests.post(url, json=json, timeout=timeout)


def _text(data, key, *, min_len, max_len=200):
    value = data.get(key)
    value = value.strip() if isinstance(value, str) else ""
    if len(value) < min_len or len(value) > max_len:
        raise DemoRequestError(400, "INVALID_FIELD", key)
    return value


def normalise_phone(raw):
    """A Portuguese mobile as `+351 9XX XXX XXX`; another country's number (leading `+` other
    than `+351`, 8–15 digits) as typed; anything else is None."""
    if not isinstance(raw, str):
        return None
    typed = raw.strip()
    compact = re.sub(r"[\s\-.()]", "", typed)
    m = _PT_MOBILE_RE.match(compact)
    if m:
        n = m.group(1)
        return f"+351 {n[0:3]} {n[3:6]} {n[6:9]}"
    # Another country's number; a +351 number that is not a mobile is refused ("Telemóvel").
    if _INTL_RE.match(compact) and not compact.startswith("+351") and len(typed) <= 40:
        return typed
    return None


def _choice(data, key, allowed):
    value = data.get(key)
    if value not in allowed:
        raise DemoRequestError(400, "INVALID_FIELD", key)
    return value


def validate(data):
    """The form's fields, checked as the web form checks them. Returns a dict or raises."""
    data = data or {}
    firstname = " ".join(_text(data, "firstname", min_len=1).split())
    lastname = " ".join(_text(data, "lastname", min_len=1).split())
    phone = normalise_phone(data.get("phone"))
    if phone is None:
        raise DemoRequestError(400, "INVALID_FIELD", "phone")
    email = _text(data, "email", min_len=3).lower()
    if not _EMAIL_RE.match(email):
        raise DemoRequestError(400, "INVALID_FIELD", "email")
    clube = _text(data, "clube", min_len=1)
    gestao = data.get("gestao")
    if (
        not isinstance(gestao, list)
        or not gestao
        or any(v not in GESTAO[1] for v in gestao)
    ):
        raise DemoRequestError(400, "INVALID_FIELD", "gestao")
    lembretes = _choice(data, "lembretes", LEMBRETES[1])
    tempo = _choice(data, "tempo", TEMPO[1])
    if data.get("consent") is not True:
        raise DemoRequestError(400, "CONSENT_REQUIRED", "consent")
    pedido = data.get("pedido")
    if pedido is not None and pedido not in PEDIDOS:
        raise DemoRequestError(400, "INVALID_FIELD", "pedido")
    return {
        "firstname": firstname,
        "lastname": lastname,
        "phone": phone,
        "email": email,
        "clube": clube,
        # In the CRM's option order, once each, so the same answers always read the same.
        "gestao": [v for v in GESTAO[1] if v in gestao],
        "lembretes": lembretes,
        "tempo": tempo,
        "marketing": data.get("marketing") is True,
        "pedido": pedido,
        "lang": data.get("lang") if data.get("lang") in CONSENT_TEXTS else "pt",
    }


def looks_automated(data):
    """The honeypot is filled, or the form was sent faster than a person can fill it."""
    data = data or {}
    if str(data.get("website") or "").strip():
        return True
    try:
        elapsed = int(data.get("elapsedMs"))
    except (TypeError, ValueError):
        return True
    return elapsed < MIN_FILL_MS


def hubspot_body(fields, data, ip, subscription_id=None):
    """The Forms API v3 submission: the visible fields, the hidden source fields, the context
    (the visitor's hutk cookie only when the browser sent one, which it does only with cookie
    consent) and the RGPD consent, with the marketing communication when a subscription is set."""
    values = [
        ("firstname", fields["firstname"]),
        ("lastname", fields["lastname"]),
        ("phone", fields["phone"]),
        ("email", fields["email"]),
        # The live form requires `clube_atual`, not `company` (PAD-650 probe, 2026-10-14).
        ("clube_atual", fields["clube"]),
        (GESTAO[0], ";".join(fields["gestao"])),
        (LEMBRETES[0], fields["lembretes"]),
        (TEMPO[0], fields["tempo"]),
        ("levapp_tipo_origem", "inbound"),
        ("levapp_canal_origem", "site"),
    ]
    if fields["pedido"]:
        values.append(("levapp_pedido_site", fields["pedido"]))
    context = {}
    hutk = data.get("hutk")
    if isinstance(hutk, str) and _HUTK_RE.match(hutk.strip()):
        context["hutk"] = hutk.strip()
    page_uri = data.get("pageUri")
    if isinstance(page_uri, str) and re.match(r"^https?://[^\s]{1,300}$", page_uri.strip()):
        context["pageUri"] = page_uri.strip()
    page_name = data.get("pageName")
    if isinstance(page_name, str) and page_name.strip():
        context["pageName"] = page_name.strip()[:100]
    context["ipAddress"] = ip
    consent = {"consentToProcess": True, "text": CONSENT_TEXTS[fields["lang"]]}
    if subscription_id:
        consent["communications"] = [
            {
                "value": fields["marketing"],
                "subscriptionTypeId": int(subscription_id),
                "text": MARKETING_TEXTS[fields["lang"]],
            }
        ]
    return {
        "fields": [{"name": n, "value": v} for n, v in values],
        "context": context,
        "legalConsentOptions": {"consent": consent},
    }


def _subscription_id():
    """The "Marketing Information" subscription type (`HUBSPOT_MARKETING_SUBSCRIPTION_ID`), or
    None when unset or not a number: then no communications consent is sent."""
    raw = str(current_app.config.get("HUBSPOT_MARKETING_SUBSCRIPTION_ID") or "").strip()
    return raw if raw.isdigit() else None


def submit(data, ip):
    """Validate, drop automated posts, forward to HubSpot. Raises DemoRequestError."""
    form_id = (current_app.config.get("HUBSPOT_DEMO_FORM_ID") or "").strip()
    if not form_id:
        raise DemoRequestError(503, "DEMO_UNAVAILABLE")
    if not isinstance(data, dict):
        raise DemoRequestError(400, "INVALID_BODY")
    if looks_automated(data):
        logger.info("demo request dropped as automated")
        return
    fields = validate(data)
    url = SUBMIT_URL.format(portal=HUBSPOT_PORTAL_ID, form=form_id)
    try:
        res = _post(url, json=hubspot_body(fields, data, ip, _subscription_id()), timeout=TIMEOUT_S)
    except Exception as exc:  # noqa: BLE001 — any transport failure is a 502 to the visitor
        logger.warning("demo request: HubSpot unreachable (%s)", type(exc).__name__)
        raise DemoRequestError(502, "DEMO_FAILED") from None
    if not 200 <= res.status_code < 300:
        logger.warning("demo request: HubSpot answered %s", res.status_code)
        raise DemoRequestError(502, "DEMO_FAILED")
