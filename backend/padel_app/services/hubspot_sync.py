"""auth.coach-crm-sync — a self-registered coach becomes a HubSpot contact (PAD-471).

Four triggers call in after their commit: sign-up (`sync_coach_signup`) and the
admin's approve / reject plus the coach's re-apply (`sync_coach_status`). Each
builds a plain dict from the coach's own row (`coach_payload`, the RGPD
allow-list), reads the config, and hands both to `run_sync` on a background
thread. `run_sync` touches no database and needs no app context, so it can move
to a real queue later without changing a caller.

Never in the way: every HubSpot failure is caught and logged as a warning that
names the step and the HTTP status, never the coach's data. With no
`HUBSPOT_PRIVATE_APP_TOKEN` every trigger is a silent no-op.
"""
import logging
import os
import threading
import time

import requests
from flask import current_app, has_app_context

logger = logging.getLogger(__name__)

API = "https://api.hubapi.com"
TIMEOUT_S = 10

# The source a coach who signs up in the app is recorded with (create only).
ORIGIN_FIELDS = {"levapp_tipo_origem": "Inbound", "levapp_canal_origem": "App LevApp"}

STATUS_VALUES = {"pending": "pendente", "approved": "aprovado", "rejected": "rejeitado"}

# Rule 2, binding: the only keys a payload may ever carry.
ALLOWED_PAYLOAD_KEYS = ("firstname", "lastname", "email", "phone", "status")
# The payload keys LevApp only fills when HubSpot has none (rule 4). `email`
# matters for the phone-only match: a contact a salesperson entered by phone.
FILL_ONLY = ("firstname", "lastname", "email", "phone")


class HubSpotError(Exception):
    def __init__(self, step, status, body=""):
        super().__init__(f"{step}: HTTP {status}")
        self.step = step
        self.status = status
        self.body = body


# ── what leaves LevApp ──────────────────────────────────────────────────────

def coach_payload(user, coach):
    """The coach's own data, from an explicit allow-list — nothing else (rule 2)."""
    first, _, last = (user.name or "").strip().partition(" ")
    payload = {
        "firstname": first,
        "lastname": last.strip(),
        "email": (user.email or "").strip().lower(),
        "phone": (user.phone or "").strip(),
        "status": STATUS_VALUES.get(coach.approval_status, ""),
    }
    return {k: payload[k] for k in ALLOWED_PAYLOAD_KEYS if payload[k]}


def _config():
    return {
        "token": (os.getenv("HUBSPOT_PRIVATE_APP_TOKEN") or "").strip(),
        "status_property": (os.getenv("HUBSPOT_ACCOUNT_STATUS_PROPERTY") or "").strip(),
        "em_teste_stage": (os.getenv("HUBSPOT_DEAL_STAGE_EM_TESTE") or "").strip(),
    }


# ── triggers ────────────────────────────────────────────────────────────────

def sync_coach_signup(user, coach):
    """Sign-up: upsert the contact, then move open deals to "Em teste"."""
    _trigger(user, coach, move_deals=True)


def sync_coach_status(coach):
    """Approve / reject / re-apply: upsert the contact, never move a deal."""
    if coach is not None:
        _trigger(coach.user, coach, move_deals=False)


def _trigger(user, coach, *, move_deals):
    try:
        config = _config()
        if not config["token"] or user is None or not user.email:
            return
        payload = coach_payload(user, coach)
        _submit(payload, config, move_deals)
    except Exception as exc:  # noqa: BLE001 — never fail the caller
        logger.warning("hubspot sync not started: %s", type(exc).__name__)


def _inline():
    """`HUBSPOT_SYNC_INLINE` (app config; default: the TESTING flag), the same
    switch push_sender has, so tests see the effect when the request returns."""
    if not has_app_context():
        return False
    value = current_app.config.get("HUBSPOT_SYNC_INLINE")
    if value is None:
        return bool(current_app.config.get("TESTING"))
    return bool(value)


def _submit(payload, config, move_deals):
    """One daemon thread per trigger, so the request answers at once. A bare
    thread, not push_sender's queue, is the coordinator's call for this volume
    (a few coach sign-ups a week): a sync lost to a restart is healed by the
    next decision's upsert (rule 6)."""
    if _inline():
        run_sync(payload, config, move_deals=move_deals)
        return
    threading.Thread(
        target=run_sync,
        args=(payload, config),
        kwargs={"move_deals": move_deals},
        name="hubspot-sync",
        daemon=True,
    ).start()


# ── the HTTP work: a plain dict and the config, nothing else ─────────────────

def run_sync(payload, config, *, move_deals):
    """Upsert the contact and, on sign-up, move its open deals. Never raises."""
    try:
        contact_id = _upsert_contact(payload, config)
        if move_deals and config.get("em_teste_stage") and contact_id:
            _move_open_deals(contact_id, config)
    except HubSpotError as exc:
        logger.warning("hubspot sync failed at %s: HTTP %s", exc.step, exc.status)
    except Exception as exc:  # noqa: BLE001 — network errors included; never raise
        logger.warning("hubspot sync failed: %s", type(exc).__name__)


RETRY_PAUSE_S = 1


def _send(method, path, config, body):
    return requests.request(
        method,
        f"{API}{path}",
        headers={
            "Authorization": f"Bearer {config['token']}",
            "Content-Type": "application/json",
        },
        json=body,
        timeout=TIMEOUT_S,
    )


def _call(method, path, config, step, body=None):
    """One HubSpot call; a 429 or 5xx is retried once, after a short pause."""
    res = _send(method, path, config, body)
    if res.status_code == 429 or res.status_code >= 500:
        time.sleep(RETRY_PAUSE_S)
        res = _send(method, path, config, body)
    if not 200 <= res.status_code < 300:
        raise HubSpotError(step, res.status_code, res.text or "")
    return res.json() if res.text else {}


def _find_contact(payload, config):
    """Rule 4: the contact with the coach's email; failing that, a contact that
    shares the phone and has NO email (a lead entered by phone). A phone match
    with a different email is someone else, so it is never returned."""
    groups = [{"filters": [{"propertyName": "email", "operator": "EQ", "value": payload["email"]}]}]
    if payload.get("phone"):
        groups.append({"filters": [{"propertyName": "phone", "operator": "EQ", "value": payload["phone"]}]})
    properties = ["firstname", "lastname", "email", "phone"]
    if config.get("status_property"):
        properties.append(config["status_property"])
    body = {"filterGroups": groups, "properties": properties, "limit": 10}
    results = _call("POST", "/crm/v3/objects/contacts/search", config, "search", body).get("results") or []

    def email_of(result):
        return ((result.get("properties") or {}).get("email") or "").strip().lower()

    for result in results:
        if email_of(result) == payload["email"]:
            return result
    for result in results:
        if not email_of(result):
            return result
    return None


def _upsert_contact(payload, config):
    """Rule 4: LevApp fills what the CRM lacks and owns only the status."""
    status_prop = config.get("status_property")
    existing = _find_contact(payload, config)
    if existing is None:
        props = {k: v for k, v in payload.items() if k != "status"}
        if status_prop and payload.get("status"):
            props[status_prop] = payload["status"]
        props.update(ORIGIN_FIELDS)
        created = _write("POST", "/crm/v3/objects/contacts", props, config, "create")
        return created.get("id")

    current = existing.get("properties") or {}
    props = {k: payload[k] for k in FILL_ONLY if payload.get(k) and not current.get(k)}
    if status_prop and payload.get("status"):
        props[status_prop] = payload["status"]
    if props:
        _write("PATCH", f"/crm/v3/objects/contacts/{existing['id']}", props, config, "update")
    return existing["id"]


def _write(method, path, props, config, step):
    """Rule 3: a 400 naming the status property is retried once without it."""
    status_prop = config.get("status_property")
    try:
        return _call(method, path, config, step, {"properties": props})
    except HubSpotError as exc:
        if exc.status == 400 and status_prop and status_prop in props and status_prop in exc.body:
            logger.warning(
                "hubspot %s rejected property %s (create it in HubSpot); writing without it",
                step,
                status_prop,
            )
            rest = {k: v for k, v in props.items() if k != status_prop}
            return _call(method, path, config, step, {"properties": rest})
        raise


def _move_open_deals(contact_id, config):
    """Rule 5: open deals, in the pipeline that has the stage, before it, move to it."""
    target = config["em_teste_stage"]
    assoc = _call("GET", f"/crm/v4/objects/contacts/{contact_id}/associations/deals", config, "deal-associations")
    deal_ids = [str(r["toObjectId"]) for r in assoc.get("results") or []]
    if not deal_ids:
        return

    pipelines = _call("GET", "/crm/v3/pipelines/deals", config, "pipelines").get("results") or []
    order = None
    pipeline_id = None
    for pipeline in pipelines:
        stages = {s["id"]: s.get("displayOrder", 0) for s in pipeline.get("stages") or []}
        if target in stages:
            order, pipeline_id = stages, pipeline["id"]
            break
    if order is None:
        logger.warning("hubspot deal stage %s is in no deal pipeline; no deal moved", target)
        return

    deals = _call(
        "POST",
        "/crm/v3/objects/deals/batch/read",
        config,
        "deals",
        {"inputs": [{"id": d} for d in deal_ids], "properties": ["dealstage", "pipeline", "hs_is_closed"]},
    ).get("results") or []
    for deal in deals:
        props = deal.get("properties") or {}
        stage = props.get("dealstage")
        if (
            props.get("pipeline") == pipeline_id
            and str(props.get("hs_is_closed")).lower() != "true"
            and stage in order
            and order[stage] < order[target]
        ):
            _call(
                "PATCH",
                f"/crm/v3/objects/deals/{deal['id']}",
                config,
                "deal-move",
                {"properties": {"dealstage": target}},
            )
