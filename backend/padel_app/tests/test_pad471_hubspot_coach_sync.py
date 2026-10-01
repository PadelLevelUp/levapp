"""auth.coach-crm-sync — a self-registered coach becomes a HubSpot contact (PAD-471).

HubSpot is never called: `requests.request` is replaced by `FakeHubSpot`, an
in-memory CRM that answers the handful of endpoints the sync uses and records
every call. Tests run with TESTING on, so the sync runs inline and its effect
is visible as soon as the request returns.
"""
import json
import logging
import re

import pytest
import requests
from flask_jwt_extended import create_access_token

from padel_app.sql_db import db

TOKEN = "pat-test-token"
STATUS_PROP = "levapp_estado_conta"
EM_TESTE = "em_teste"


class FakeResponse:
    def __init__(self, status_code, body=None):
        self.status_code = status_code
        self._body = body if body is not None else {}
        self.text = json.dumps(self._body)
        self.ok = 200 <= status_code < 300

    def json(self):
        return self._body


class FakeHubSpot:
    """Contacts, deals and two deal pipelines, held in dicts."""

    def __init__(self):
        self.calls = []  # (method, path, body)
        self.timeouts = []
        self.contacts = {}  # id -> properties
        self.contact_deals = {}  # contact id -> [deal ids]
        self.deals = {}  # id -> properties
        self.pipelines = [
            {
                "id": "sales",
                "stages": [
                    {"id": "identificado", "displayOrder": 0},
                    {"id": "contactado", "displayOrder": 1},
                    {"id": EM_TESTE, "displayOrder": 2},
                    {"id": "proposta", "displayOrder": 3},
                ],
            },
            {"id": "clubs", "stages": [{"id": "club_novo", "displayOrder": 0}]},
        ]
        self.fail_with = None  # a status code every call answers with
        self.raise_exc = None  # an exception every call raises
        self.missing_properties = set()  # contact properties HubSpot does not know
        self._next = 100

    def __call__(self, method, url, headers=None, json=None, timeout=None, **_):
        path = url.replace("https://api.hubapi.com", "")
        self.calls.append((method, path, json))
        self.timeouts.append(timeout)
        assert headers["Authorization"] == f"Bearer {TOKEN}"
        if self.raise_exc is not None:
            raise self.raise_exc
        if self.fail_with is not None:
            return FakeResponse(self.fail_with, {"message": "boom"})

        if method == "POST" and path == "/crm/v3/objects/contacts/search":
            wanted = {
                f["propertyName"]: f["value"]
                for group in json["filterGroups"]
                for f in group["filters"]
            }
            hits = [
                {"id": cid, "properties": props}
                for cid, props in self.contacts.items()
                if any(props.get(k) == v for k, v in wanted.items())
            ]
            return FakeResponse(200, {"total": len(hits), "results": hits[: json.get("limit", 10)]})

        if method in ("POST", "PATCH") and path.startswith("/crm/v3/objects/contacts"):
            bad = self.missing_properties & set(json["properties"])
            if bad:
                name = sorted(bad)[0]
                return FakeResponse(
                    400,
                    {
                        "status": "error",
                        "category": "VALIDATION_ERROR",
                        "message": f'Property values were not valid: [{{"name":"{name}","error":"PROPERTY_DOESNT_EXIST"}}]',
                    },
                )
            if method == "POST":
                self._next += 1
                cid = str(self._next)
                self.contacts[cid] = dict(json["properties"])
                return FakeResponse(201, {"id": cid})
            cid = path.rsplit("/", 1)[1]
            self.contacts[cid].update(json["properties"])
            return FakeResponse(200, {"id": cid})

        m = re.fullmatch(r"/crm/v4/objects/contacts/(\w+)/associations/deals", path)
        if method == "GET" and m:
            ids = self.contact_deals.get(m.group(1), [])
            return FakeResponse(200, {"results": [{"toObjectId": int(d)} for d in ids]})

        if method == "POST" and path == "/crm/v3/objects/deals/batch/read":
            results = [
                {"id": i["id"], "properties": self.deals[i["id"]]}
                for i in json["inputs"]
                if i["id"] in self.deals
            ]
            return FakeResponse(200, {"results": results})

        if method == "GET" and path == "/crm/v3/pipelines/deals":
            return FakeResponse(200, {"results": self.pipelines})

        m = re.fullmatch(r"/crm/v3/objects/deals/(\w+)", path)
        if method == "PATCH" and m:
            self.deals[m.group(1)].update(json["properties"])
            return FakeResponse(200, {"id": m.group(1)})

        return FakeResponse(404, {"message": f"fake has no {method} {path}"})

    # helpers for assertions
    def writes(self):
        return [c for c in self.calls if c[0] in ("POST", "PATCH") and "search" not in c[1] and "batch" not in c[1]]

    def deal_calls(self):
        return [c for c in self.calls if "deal" in c[1]]


@pytest.fixture(autouse=True)
def _jwt_secret(app):
    app.config["JWT_SECRET_KEY"] = "test-jwt-secret"


@pytest.fixture
def hubspot(monkeypatch):
    from padel_app.services import hubspot_sync

    fake = FakeHubSpot()
    monkeypatch.setattr(requests, "request", fake)
    monkeypatch.setattr(hubspot_sync, "RETRY_PAUSE_S", 0)
    monkeypatch.setenv("HUBSPOT_PRIVATE_APP_TOKEN", TOKEN)
    monkeypatch.setenv("HUBSPOT_ACCOUNT_STATUS_PROPERTY", STATUS_PROP)
    monkeypatch.setenv("HUBSPOT_DEAL_STAGE_EM_TESTE", EM_TESTE)
    return fake


def _coach_body(username="ana", email="ana@example.com", name="Ana Lima", **over):
    body = {
        "role": "coach",
        "name": name,
        "username": username,
        "email": email,
        "password": "Segura123",
        "birthDate": "2000-01-01",
        "country": "PT",
    }
    body.update(over)
    return body


def _register(client, **over):
    res = client.post("/api/auth/register", json=_coach_body(**over))
    assert res.status_code == 201, res.get_json()
    return res.get_json()


def _auth(app, user_id):
    with app.app_context():
        return {"Authorization": f"Bearer {create_access_token(identity=str(user_id))}"}


def _admin(app):
    from padel_app.models import User

    with app.app_context():
        user = User(name="Admin", username="admin", password="pw", status="active", is_superadmin=True)
        db.session.add(user)
        db.session.commit()
        return user.id


def _coach_id(app, username="ana"):
    from padel_app.models import Coach, User

    with app.app_context():
        user = User.query.filter_by(username=username).first()
        return Coach.query.filter_by(user_id=user.id).first().id


# --- Sign-up: a new contact ------------------------------------------------

def test_new_coach_becomes_a_contact_with_the_app_as_source(client, hubspot):
    _register(client)

    search = [c for c in hubspot.calls if c[1].endswith("/contacts/search")]
    assert len(search) == 1
    filters = [f for g in search[0][2]["filterGroups"] for f in g["filters"]]
    assert filters == [{"propertyName": "email", "operator": "EQ", "value": "ana@example.com"}]

    creates = [c for c in hubspot.writes() if c[0] == "POST"]
    assert len(creates) == 1
    assert creates[0][2]["properties"] == {
        "firstname": "Ana",
        "lastname": "Lima",
        "email": "ana@example.com",
        STATUS_PROP: "pendente",
        "levapp_tipo_origem": "Inbound",
        "levapp_canal_origem": "App LevApp",
    }


# --- Sign-up: an existing contact ------------------------------------------

def test_existing_contact_is_filled_not_overwritten(client, hubspot):
    hubspot.contacts["7"] = {
        "email": "ana@example.com",
        "firstname": "Ana Sofia",
        "lastname": "",
        "levapp_tipo_origem": "Outbound",
        "levapp_canal_origem": "Instagram",
    }
    _register(client)

    assert not [c for c in hubspot.writes() if c[0] == "POST"], "no duplicate contact"
    patches = [c for c in hubspot.writes() if c[0] == "PATCH" and "/contacts/" in c[1]]
    assert len(patches) == 1
    assert patches[0][1] == "/crm/v3/objects/contacts/7"
    # LevApp fills what the CRM lacks and owns only the status.
    assert patches[0][2]["properties"] == {"lastname": "Lima", STATUS_PROP: "pendente"}
    assert hubspot.contacts["7"]["firstname"] == "Ana Sofia"
    assert hubspot.contacts["7"]["levapp_tipo_origem"] == "Outbound"
    assert hubspot.contacts["7"]["levapp_canal_origem"] == "Instagram"


# --- Sign-up: deals ----------------------------------------------------------

def test_only_open_earlier_deals_in_the_stage_pipeline_move_to_em_teste(client, hubspot):
    hubspot.contacts["7"] = {"email": "ana@example.com", "firstname": "Ana", "lastname": "Lima"}
    hubspot.contact_deals["7"] = ["11", "12", "13", "14", "15"]
    hubspot.deals = {
        "11": {"dealstage": "identificado", "pipeline": "sales", "hs_is_closed": "false"},
        "12": {"dealstage": "proposta", "pipeline": "sales", "hs_is_closed": "false"},
        "13": {"dealstage": "contactado", "pipeline": "sales", "hs_is_closed": "true"},
        "14": {"dealstage": "club_novo", "pipeline": "clubs", "hs_is_closed": "false"},
        "15": {"dealstage": EM_TESTE, "pipeline": "sales", "hs_is_closed": "false"},
    }
    _register(client)

    moved = [c for c in hubspot.calls if c[0] == "PATCH" and "/deals/" in c[1]]
    assert moved == [("PATCH", "/crm/v3/objects/deals/11", {"properties": {"dealstage": EM_TESTE}})]
    assert hubspot.deals["12"]["dealstage"] == "proposta"
    assert hubspot.deals["13"]["dealstage"] == "contactado"
    assert hubspot.deals["14"]["dealstage"] == "club_novo"


def test_without_a_stage_configured_no_deal_is_read(client, hubspot, monkeypatch):
    monkeypatch.delenv("HUBSPOT_DEAL_STAGE_EM_TESTE")
    hubspot.contacts["7"] = {"email": "ana@example.com"}
    hubspot.contact_deals["7"] = ["11"]
    hubspot.deals = {"11": {"dealstage": "identificado", "pipeline": "sales", "hs_is_closed": "false"}}
    _register(client)

    assert hubspot.deal_calls() == []


# --- RGPD: the allow-list ----------------------------------------------------

def _fill_every_column(obj):
    """Give every column a value, so an attribute that leaks into the payload
    shows up whatever the column is (birth_date, country, username, …)."""
    import datetime as dt

    from sqlalchemy import Boolean, Date, DateTime, Enum, Integer, Numeric, String, Text

    for col in obj.__table__.columns:
        if getattr(obj, col.key, None) not in (None, ""):
            continue
        t = col.type
        if isinstance(t, Enum):
            value = t.enums[0]
        elif isinstance(t, (String, Text)):
            value = f"x-{col.key}"
        elif isinstance(t, DateTime):
            value = dt.datetime(2000, 1, 2, 3, 4, 5)
        elif isinstance(t, Date):
            value = dt.date(2000, 1, 2)
        elif isinstance(t, Boolean):
            value = True
        elif isinstance(t, (Integer, Numeric)):
            value = 7
        else:
            value = "x"
        setattr(obj, col.key, value)


def test_payload_is_the_allow_list_and_nothing_else(app):
    """The binding RGPD section, as a test: every User and Coach column holds a
    value, and the payload keys are still exactly the allow-list."""
    from padel_app.models import Coach, User
    from padel_app.services.hubspot_sync import coach_payload

    with app.app_context():
        user = User(name="Ana Maria Lima", email="ana@example.com", phone="+351912345678")
        coach = Coach(approval_status="approved")
        _fill_every_column(user)
        _fill_every_column(coach)
        user.name, user.email, user.phone = "Ana Maria Lima", "ana@example.com", "+351912345678"
        coach.approval_status = "approved"

        assert coach_payload(user, coach) == {
            "firstname": "Ana",
            "lastname": "Maria Lima",
            "email": "ana@example.com",
            "phone": "+351912345678",
            "status": "aprovado",
        }

        user.phone = None
        user.name = "Ana"
        assert coach_payload(user, coach) == {
            "firstname": "Ana",
            "email": "ana@example.com",
            "status": "aprovado",
        }


def test_a_phone_widens_the_lookup(app, hubspot):
    from padel_app.services.hubspot_sync import run_sync

    run_sync(
        {"firstname": "Ana", "email": "ana@example.com", "phone": "+351912345678", "status": "pendente"},
        {"token": TOKEN, "status_property": STATUS_PROP, "em_teste_stage": ""},
        move_deals=False,
    )
    groups = hubspot.calls[0][2]["filterGroups"]
    assert groups == [
        {"filters": [{"propertyName": "email", "operator": "EQ", "value": "ana@example.com"}]},
        {"filters": [{"propertyName": "phone", "operator": "EQ", "value": "+351912345678"}]},
    ]


def _sync(payload, **config):
    from padel_app.services.hubspot_sync import run_sync

    cfg = {"token": TOKEN, "status_property": STATUS_PROP, "em_teste_stage": ""}
    cfg.update(config)
    run_sync(payload, cfg, move_deals=False)


ANA = {"firstname": "Ana", "email": "ana@example.com", "phone": "+351912345678", "status": "pendente"}


def test_the_email_match_wins_over_a_phone_match(app, hubspot):
    """Rule 4: two contacts, one with the phone and another email, one with the
    coach's email — the email one is written, the other is not touched."""
    hubspot.contacts["5"] = {"email": "outro@example.com", "phone": "+351912345678", "firstname": "Rui"}
    hubspot.contacts["6"] = {"email": "ana@example.com", "firstname": "Ana"}
    _sync(ANA)

    writes = hubspot.writes()
    assert [c[1] for c in writes] == ["/crm/v3/objects/contacts/6"]
    assert hubspot.contacts["5"] == {"email": "outro@example.com", "phone": "+351912345678", "firstname": "Rui"}


def test_a_phone_match_without_email_is_the_coach_and_gets_the_email(app, hubspot):
    """Rule 4: a lead entered by phone (no email yet) is the coach's contact."""
    hubspot.contacts["5"] = {"phone": "+351912345678", "firstname": "Ana", "levapp_tipo_origem": "Outbound"}
    _sync(ANA)

    writes = hubspot.writes()
    assert [(c[0], c[1]) for c in writes] == [("PATCH", "/crm/v3/objects/contacts/5")]
    assert writes[0][2]["properties"] == {"email": "ana@example.com", STATUS_PROP: "pendente"}
    assert hubspot.contacts["5"]["levapp_tipo_origem"] == "Outbound"


def test_a_phone_match_with_another_email_is_someone_else(app, hubspot):
    """Rule 4: sharing a phone with a contact that has a different email does not
    make it the coach's — a new contact is created and the other is untouched."""
    hubspot.contacts["5"] = {"email": "outro@example.com", "phone": "+351912345678", "firstname": "Rui"}
    _sync(ANA)

    writes = hubspot.writes()
    assert [(c[0], c[1]) for c in writes] == [("POST", "/crm/v3/objects/contacts")]
    assert writes[0][2]["properties"]["email"] == "ana@example.com"
    assert hubspot.contacts["5"] == {"email": "outro@example.com", "phone": "+351912345678", "firstname": "Rui"}


def test_a_400_that_names_no_status_property_is_not_retried(client, hubspot, caplog):
    hubspot.missing_properties = {"firstname"}
    with caplog.at_level(logging.WARNING):
        _register(client)

    creates = [c for c in hubspot.writes() if c[0] == "POST"]
    assert len(creates) == 1
    assert hubspot.contacts == {}
    warnings = [r.getMessage() for r in caplog.records if "hubspot" in r.getMessage().lower()]
    assert warnings == ["hubspot sync failed at create: HTTP 400"]


# --- Admin decisions ---------------------------------------------------------

@pytest.mark.parametrize(
    "decision, status",
    [("approve", "aprovado"), ("reject", "rejeitado")],
)
def test_admin_decision_updates_status_and_never_touches_deals(client, app, hubspot, decision, status):
    _register(client)
    coach_id = _coach_id(app)
    admin_id = _admin(app)
    hubspot.calls.clear()

    res = client.post(f"/api/app/admin/coach-approvals/{coach_id}/{decision}", headers=_auth(app, admin_id), json={})
    assert res.status_code == 200, res.get_json()

    patches = [c for c in hubspot.writes() if c[0] == "PATCH"]
    assert [c[2]["properties"] for c in patches] == [{STATUS_PROP: status}]
    assert not [c for c in hubspot.writes() if c[0] == "POST"]
    assert hubspot.deal_calls() == []


def test_reapply_sets_status_back_to_pendente(client, app, hubspot):
    _register(client)
    coach_id = _coach_id(app)
    admin_id = _admin(app)
    client.post(f"/api/app/admin/coach-approvals/{coach_id}/reject", headers=_auth(app, admin_id), json={})
    hubspot.calls.clear()

    res = client.post("/api/auth/coach-approval/reapply", json={"username": "ana", "password": "Segura123"})
    assert res.status_code == 200, res.get_json()

    patches = [c for c in hubspot.writes() if c[0] == "PATCH"]
    assert [c[2]["properties"] for c in patches] == [{STATUS_PROP: "pendente"}]
    assert hubspot.deal_calls() == []


def test_a_transition_heals_a_missing_contact(client, app, hubspot, monkeypatch):
    monkeypatch.delenv("HUBSPOT_PRIVATE_APP_TOKEN")
    _register(client)  # token not installed yet: no contact made
    assert hubspot.calls == []
    monkeypatch.setenv("HUBSPOT_PRIVATE_APP_TOKEN", TOKEN)
    hubspot.contact_deals["999"] = []

    res = client.post(f"/api/app/admin/coach-approvals/{_coach_id(app)}/approve", headers=_auth(app, _admin(app)), json={})
    assert res.status_code == 200

    creates = [c for c in hubspot.writes() if c[0] == "POST"]
    assert len(creates) == 1
    assert creates[0][2]["properties"] == {
        "firstname": "Ana",
        "lastname": "Lima",
        "email": "ana@example.com",
        STATUS_PROP: "aprovado",
        "levapp_tipo_origem": "Inbound",
        "levapp_canal_origem": "App LevApp",
    }
    assert hubspot.deal_calls() == []


# --- Misconfiguration: the status property does not exist --------------------

def test_missing_status_property_degrades_to_contact_without_status(client, hubspot, caplog):
    hubspot.missing_properties = {STATUS_PROP}
    with caplog.at_level(logging.WARNING):
        _register(client)

    creates = [c for c in hubspot.writes() if c[0] == "POST"]
    assert len(creates) == 2
    assert STATUS_PROP in creates[0][2]["properties"]
    assert STATUS_PROP not in creates[1][2]["properties"]
    assert len(hubspot.contacts) == 1
    warnings = [r.getMessage() for r in caplog.records if "hubspot" in r.getMessage().lower()]
    assert any(STATUS_PROP in w for w in warnings)
    assert not any("ana@example.com" in w or "Ana" in w for w in warnings)


# --- Never in the way --------------------------------------------------------

@pytest.mark.parametrize("failure", ["500", "network"])
def test_hubspot_failing_never_blocks_signup_or_decisions(client, app, hubspot, caplog, failure):
    from padel_app.models import Coach, User

    if failure == "500":
        hubspot.fail_with = 500
    else:
        hubspot.raise_exc = requests.ConnectionError("down")

    with caplog.at_level(logging.WARNING):
        _register(client)
        coach_id = _coach_id(app)
        admin_id = _admin(app)
        assert client.post(f"/api/app/admin/coach-approvals/{coach_id}/reject", headers=_auth(app, admin_id), json={}).status_code == 200
        assert client.post("/api/auth/coach-approval/reapply", json={"username": "ana", "password": "Segura123"}).status_code == 200
        assert client.post(f"/api/app/admin/coach-approvals/{coach_id}/approve", headers=_auth(app, admin_id), json={}).status_code == 200

    with app.app_context():
        user = User.query.filter_by(username="ana").first()
        assert user.status == "active"
        assert Coach.query.get(coach_id).approval_status == "approved"

    warnings = [r.getMessage() for r in caplog.records if r.levelno == logging.WARNING and "hubspot" in r.getMessage().lower()]
    assert len(warnings) >= 4
    # The warning names the step, never the coach's data.
    assert not any("ana@example.com" in w or "Ana" in w for w in warnings)


def test_signup_answers_while_hubspot_is_still_busy(client, app, hubspot, monkeypatch):
    """Off the request thread for real: HubSpot is held, sign-up still answers."""
    import threading
    import time

    monkeypatch.setitem(app.config, "HUBSPOT_SYNC_INLINE", False)
    release = threading.Event()
    answer = hubspot.__call__

    def held(*args, **kwargs):
        release.wait(5)
        return answer(*args, **kwargs)

    monkeypatch.setattr(requests, "request", held)

    started = time.monotonic()
    _register(client)
    elapsed = time.monotonic() - started
    assert elapsed < 2, f"sign-up waited {elapsed:.1f}s for HubSpot"
    assert hubspot.calls == []

    release.set()
    for t in [t for t in threading.enumerate() if t.name == "hubspot-sync"]:
        t.join(5)
    assert [c for c in hubspot.writes() if c[0] == "POST"], "the sync still ran"


def test_a_5xx_is_retried_once(app, hubspot):
    from padel_app.services.hubspot_sync import run_sync

    hubspot.fail_with = 503
    run_sync(
        {"firstname": "Ana", "email": "ana@example.com", "status": "pendente"},
        {"token": TOKEN, "status_property": STATUS_PROP, "em_teste_stage": ""},
        move_deals=False,
    )
    assert [c[1] for c in hubspot.calls] == ["/crm/v3/objects/contacts/search"] * 2


# --- Off without a token, and only coaches ------------------------------------

def test_no_token_no_traffic(client, app, hubspot, monkeypatch, caplog):
    monkeypatch.delenv("HUBSPOT_PRIVATE_APP_TOKEN")
    with caplog.at_level(logging.DEBUG):
        _register(client)
        coach_id = _coach_id(app)
        admin_id = _admin(app)
        client.post(f"/api/app/admin/coach-approvals/{coach_id}/reject", headers=_auth(app, admin_id), json={})
        client.post("/api/auth/coach-approval/reapply", json={"username": "ana", "password": "Segura123"})
        client.post(f"/api/app/admin/coach-approvals/{coach_id}/approve", headers=_auth(app, admin_id), json={})

    assert hubspot.calls == []
    assert not [r for r in caplog.records if "hubspot" in r.getMessage().lower()]


def test_students_and_refused_signups_never_sync(client, hubspot):
    res = client.post("/api/auth/register", json=_coach_body(role="student", username="aluno", email="aluno@example.com"))
    assert res.status_code == 201
    res = client.post("/api/auth/register", json=_coach_body(username="teen", email="teen@example.com", birthDate="2012-01-01"))
    assert res.status_code == 400
    assert res.get_json().get("code") == "UNDERAGE"

    assert hubspot.calls == []


# --- After the commit, at every trigger site ---------------------------------

@pytest.fixture
def commits(app):
    """Counts session commits from now on. A trigger that fires before its
    request's commit sees 0 (a second connection is no witness here: the test
    database may share one connection, where flushed rows look committed)."""
    from sqlalchemy import event
    from sqlalchemy.orm import Session

    state = {"n": 0}

    def on_commit(session):
        state["n"] += 1

    event.listen(Session, "after_commit", on_commit)
    yield state
    event.remove(Session, "after_commit", on_commit)


def test_signup_syncs_only_after_its_commit(client, app, monkeypatch, commits):
    from padel_app.services import hubspot_sync

    seen = []
    monkeypatch.setattr(
        hubspot_sync,
        "sync_coach_signup",
        lambda user, coach: seen.append((commits["n"], coach.approval_status)),
    )
    _register(client)
    assert len(seen) == 1
    committed_before_sync, status = seen[0]
    assert committed_before_sync >= 1, "the sign-up sync ran before the account was committed"
    assert status == "pending"


@pytest.mark.parametrize(
    "decision, expected",
    [("approve", "approved"), ("reject", "rejected")],
)
def test_a_decision_syncs_only_after_its_commit(client, app, monkeypatch, commits, decision, expected):
    from padel_app.services import hubspot_sync

    _register(client)
    coach_id = _coach_id(app)
    admin_id = _admin(app)
    seen = []
    monkeypatch.setattr(
        hubspot_sync,
        "sync_coach_status",
        lambda coach: seen.append((commits["n"], coach.approval_status)),
    )
    commits["n"] = 0
    res = client.post(f"/api/app/admin/coach-approvals/{coach_id}/{decision}", headers=_auth(app, admin_id), json={})
    assert res.status_code == 200
    assert len(seen) == 1
    assert seen[0][0] >= 1, f"the {decision} sync ran before the decision was committed"
    assert seen[0][1] == expected


def test_reapply_syncs_only_after_its_commit(client, app, monkeypatch, commits):
    from padel_app.services import hubspot_sync

    _register(client)
    coach_id = _coach_id(app)
    client.post(f"/api/app/admin/coach-approvals/{coach_id}/reject", headers=_auth(app, _admin(app)), json={})
    seen = []
    monkeypatch.setattr(
        hubspot_sync,
        "sync_coach_status",
        lambda coach: seen.append((commits["n"], coach.approval_status)),
    )
    commits["n"] = 0
    res = client.post("/api/auth/coach-approval/reapply", json={"username": "ana", "password": "Segura123"})
    assert res.status_code == 200
    assert len(seen) == 1
    assert seen[0][0] >= 1, "the re-apply sync ran before the re-application was committed"
    assert seen[0][1] == "pending"


# --- Rule 1: nothing else syncs ----------------------------------------------

def test_only_signup_and_decisions_reach_the_sync():
    """By construction: only the registration and approval services import it."""
    import pathlib

    root = pathlib.Path(__file__).resolve().parents[1]
    importers = sorted(
        str(p.relative_to(root))
        for p in root.rglob("*.py")
        if "tests" not in p.parts and p.name != "hubspot_sync.py" and "hubspot_sync" in p.read_text()
    )
    assert importers == ["services/coach_approval_service.py", "services/registration_service.py"]


def test_an_invited_coach_does_not_sync(client, app, hubspot):
    from datetime import datetime, timedelta

    from padel_app.models import Association_CoachClub, Club, Coach, CoachInvitation, User

    with app.app_context():
        inviter = User(name="Inviter", username="inviter", password="pw", status="active")
        db.session.add(inviter)
        db.session.flush()
        inviter_coach = Coach(user_id=inviter.id)
        club = Club(name="Inviting Club")
        db.session.add_all([inviter_coach, club])
        db.session.flush()
        db.session.add(Association_CoachClub(coach_id=inviter_coach.id, club_id=club.id))
        db.session.add(
            CoachInvitation(
                club_id=club.id,
                token="tok-pad471",
                invited_by_coach_id=inviter_coach.id,
                status="pending",
                expires_at=datetime.utcnow() + timedelta(days=7),
            )
        )
        db.session.commit()

    res = client.post(
        "/api/app/coach-invitations/tok-pad471/accept",
        json={"name": "New Coach", "username": "newcoach", "password": "pw123456", "email": "new@example.com", "birthDate": "1990-01-01"},
    )
    assert res.status_code in (200, 201), res.get_json()
    assert hubspot.calls == []


def test_a_profile_edit_does_not_sync(client, app, hubspot):
    body = _register(client)
    hubspot.calls.clear()
    res = client.patch(
        "/api/auth/me",
        headers={"Authorization": f"Bearer {body['accessToken']}"},
        json={"name": "Ana Lima Costa", "phone": "+351912345678"},
    )
    assert res.status_code == 200, res.get_json()
    assert hubspot.calls == []


# --- Rules 3, 4, 6 -------------------------------------------------------------

def test_without_a_status_property_no_status_is_sent(client, hubspot, monkeypatch):
    monkeypatch.delenv("HUBSPOT_ACCOUNT_STATUS_PROPERTY")
    _register(client)
    creates = [c for c in hubspot.writes() if c[0] == "POST"]
    assert len(creates) == 1
    assert STATUS_PROP not in creates[0][2]["properties"]
    assert set(creates[0][2]["properties"]) == {
        "firstname", "lastname", "email", "levapp_tipo_origem", "levapp_canal_origem",
    }


def test_a_rejected_coach_is_patched_never_deleted(client, app, hubspot):
    _register(client)
    client.post(f"/api/app/admin/coach-approvals/{_coach_id(app)}/reject", headers=_auth(app, _admin(app)), json={})
    assert hubspot.contacts, "the contact is still there"
    assert {c[0] for c in hubspot.calls} <= {"GET", "POST", "PATCH"}


def test_a_429_is_retried_once(app, hubspot):
    hubspot.fail_with = 429
    _sync({"firstname": "Ana", "email": "ana@example.com", "status": "pendente"})
    assert [c[1] for c in hubspot.calls] == ["/crm/v3/objects/contacts/search"] * 2


def test_every_call_times_out_after_ten_seconds(client, hubspot):
    hubspot.contacts["7"] = {"email": "ana@example.com"}
    hubspot.contact_deals["7"] = ["11"]
    hubspot.deals = {"11": {"dealstage": "identificado", "pipeline": "sales", "hs_is_closed": "false"}}
    _register(client)
    assert len(hubspot.timeouts) >= 5
    assert set(hubspot.timeouts) == {10}
