"""auth.landing-page rule 10 (PAD-617): the site's demo request, relayed to HubSpot.

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
SUBMIT_URL = "https://api.hsforms.com/submissions/v3/integration/submit/{portal}/{form}"
TIMEOUT_S = 10
MIN_FILL_MS = 3000
PEDIDOS = ("demonstracao", "mes_gratis")
CONSENT_TEXT = (
    "Aceito ser contactado pela LevApp sobre a demonstração, de acordo com a Política de Privacidade."
)
_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
#: HubSpot's visitor cookie is 32 hex characters; anything else is not forwarded.
_HUTK_RE = re.compile(r"^[0-9a-f]{32}$")


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


def _positive_int(data, key):
    raw = data.get(key)
    try:
        number = int(str(raw).strip())
    except (TypeError, ValueError):
        raise DemoRequestError(400, "INVALID_FIELD", key) from None
    if number <= 0 or number > 100000:
        raise DemoRequestError(400, "INVALID_FIELD", key)
    return number


def validate(data):
    """The form's fields, checked as the web form checks them. Returns a dict or raises."""
    data = data or {}
    fullname = _text(data, "fullname", min_len=2)
    email = _text(data, "email", min_len=3).lower()
    if not _EMAIL_RE.match(email):
        raise DemoRequestError(400, "INVALID_FIELD", "email")
    phone = _text(data, "phone", min_len=9, max_len=40)
    company = _text(data, "company", min_len=2)
    city = _text(data, "city", min_len=2)
    alunos = _positive_int(data, "alunos")
    horas = _positive_int(data, "horas")
    message = data.get("message")
    message = message.strip() if isinstance(message, str) else ""
    if len(message) > 2000:
        raise DemoRequestError(400, "INVALID_FIELD", "message")
    if data.get("consent") is not True:
        raise DemoRequestError(400, "CONSENT_REQUIRED", "consent")
    pedido = data.get("pedido") or "demonstracao"
    if pedido not in PEDIDOS:
        raise DemoRequestError(400, "INVALID_FIELD", "pedido")
    parts = fullname.split()
    return {
        "firstname": parts[0],
        "lastname": " ".join(parts[1:]),
        "email": email,
        "phone": phone,
        "company": company,
        "city": city,
        "alunos": alunos,
        "horas": horas,
        "message": message,
        "pedido": pedido,
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


def hubspot_body(fields, data, ip):
    """The Forms API v3 submission: the visible fields, the hidden source fields, the context
    (the visitor's hutk cookie only when the browser had one) and the RGPD consent."""
    values = [
        ("firstname", fields["firstname"]),
        ("lastname", fields["lastname"]),
        ("email", fields["email"]),
        ("phone", fields["phone"]),
        ("company", fields["company"]),
        ("city", fields["city"]),
        ("levapp_num_alunos", str(fields["alunos"])),
        ("levapp_horas_aulas_semana", str(fields["horas"])),
        ("levapp_funcao", "treinador"),
        ("levapp_pedido_site", fields["pedido"]),
        ("levapp_canal_origem", "site"),
        ("levapp_tipo_origem", "inbound"),
    ]
    if fields["message"]:
        values.append(("message", fields["message"]))
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
    return {
        "fields": [{"name": n, "value": v} for n, v in values],
        "context": context,
        "legalConsentOptions": {"consent": {"consentToProcess": True, "text": CONSENT_TEXT}},
    }


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
        res = _post(url, json=hubspot_body(fields, data, ip), timeout=TIMEOUT_S)
    except Exception as exc:  # noqa: BLE001 — any transport failure is a 502 to the visitor
        logger.warning("demo request: HubSpot unreachable (%s)", type(exc).__name__)
        raise DemoRequestError(502, "DEMO_FAILED") from None
    if not 200 <= res.status_code < 300:
        logger.warning("demo request: HubSpot answered %s", res.status_code)
        raise DemoRequestError(502, "DEMO_FAILED")
