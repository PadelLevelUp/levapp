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
        assert headers["Authorization"] == f"Bearer {TOKEN}"
        assert timeout, "every HubSpot call needs a timeout"
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
            return FakeResponse(200, {"total": len(hits), "results": hits[:1]})

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
    fake = FakeHubSpot()
    monkeypatch.setattr(requests, "request", fake)
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

def test_payload_is_the_allow_list_and_nothing_else(app):
    """The binding RGPD section, as a test: whatever a User or Coach grows, the
    payload keys stay exactly these."""
    from padel_app.models import Coach, Player, User
    from padel_app.services.hubspot_sync import coach_payload

    with app.app_context():
        user = User(
            name="Ana Maria Lima",
            username="ana",
            email="ana@example.com",
            phone="+351912345678",
            password="hash",
            status="active",
            country="PT",
        )
        db.session.add(user)
        db.session.flush()
        coach = Coach(user_id=user.id, approval_status="approved")
        db.session.add(coach)
        student = User(name="Aluno", username="aluno", password="pw", status="active")
        db.session.add(student)
        db.session.flush()
        db.session.add(Player(user_id=student.id))
        db.session.commit()

        payload = coach_payload(user, coach)
        assert payload == {
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
    assert any(STATUS_PROP in r.getMessage() for r in caplog.records if r.levelno == logging.WARNING)


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


def test_signup_answers_while_hubspot_is_still_busy(client, hubspot, monkeypatch):
    """Off the request thread for real: HubSpot is held, sign-up still answers."""
    import threading
    import time

    monkeypatch.setenv("HUBSPOT_SYNC_INLINE", "0")
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
