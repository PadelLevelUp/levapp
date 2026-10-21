"""PAD-607 — auth.account-deletion rule 11 and auth.coach-crm-sync rule 9: a coach who
deletes their account has their HubSpot contact archived, matched by exact email only,
after the deletion's commit; a HubSpot failure never blocks the deletion.

HubSpot is the in-memory fake of the PAD-471 tests, taught to archive (DELETE).
"""
import logging

import pytest
import requests
from flask_jwt_extended import create_access_token

from padel_app.sql_db import db
from padel_app.tests.test_pad471_hubspot_coach_sync import (  # noqa: F401 — `commits` is a fixture
    TOKEN,
    FakeHubSpot,
    FakeResponse,
    commits,
)

EMAIL = "ana@example.com"
PHONE = "+351912345678"


class ArchivingHubSpot(FakeHubSpot):
    def __init__(self):
        super().__init__()
        self.archived = []

    def __call__(self, method, url, headers=None, json=None, timeout=None, **kw):
        path = url.replace("https://api.hubapi.com", "")
        if method == "DELETE" and path.startswith("/crm/v3/objects/contacts/") and self.fail_with is None \
                and self.raise_exc is None:
            self.calls.append((method, path, json))
            cid = path.rsplit("/", 1)[1]
            if cid not in self.contacts:
                return FakeResponse(404, {"message": "no such contact"})
            self.archived.append(cid)
            self.contacts.pop(cid)
            return FakeResponse(204, None)
        return super().__call__(method, url, headers=headers, json=json, timeout=timeout, **kw)


@pytest.fixture(autouse=True)
def _jwt_secret(app):
    app.config["JWT_SECRET_KEY"] = "test-jwt-secret"


@pytest.fixture
def hubspot(monkeypatch):
    from padel_app.services import hubspot_sync

    fake = ArchivingHubSpot()
    monkeypatch.setattr(requests, "request", fake)
    monkeypatch.setattr(hubspot_sync, "RETRY_PAUSE_S", 0)
    monkeypatch.setenv("HUBSPOT_PRIVATE_APP_TOKEN", TOKEN)
    return fake


def _account(app, *, coach=True, email=EMAIL):
    from padel_app.models import User
    from padel_app.models.coaches import Coach
    from padel_app.models.players import Player

    with app.app_context():
        user = User(name="Ana Lima", username="ana607", email=email, phone=PHONE, password="x", status="active")
        db.session.add(user)
        db.session.flush()
        db.session.add(Coach(user_id=user.id) if coach else Player(user_id=user.id))
        db.session.commit()
        return user.id


def _delete(app, client, user_id):
    with app.app_context():
        headers = {"Authorization": f"Bearer {create_access_token(identity=str(user_id))}"}
    res = client.delete("/api/auth/me", headers=headers)
    assert res.status_code == 200, res.get_json()


def test_a_deleting_coachs_contact_is_archived_and_a_phone_only_lead_is_not(app, client, hubspot):
    from padel_app.models import User

    hubspot.contacts = {"1": {"email": EMAIL, "firstname": "Ana"}, "2": {"phone": PHONE, "firstname": "Lead"}}
    user_id = _account(app)
    _delete(app, client, user_id)

    assert hubspot.archived == ["1"]
    assert "2" in hubspot.contacts
    search = [c for c in hubspot.calls if c[1].endswith("/contacts/search")]
    assert len(search) == 1
    assert [f for g in search[0][2]["filterGroups"] for f in g["filters"]] == [
        {"propertyName": "email", "operator": "EQ", "value": EMAIL}
    ]
    with app.app_context():
        assert db.session.get(User, user_id).status == "disabled"


def test_no_contact_nothing_archived(app, client, hubspot):
    _delete(app, client, _account(app))
    assert hubspot.archived == []
    assert [c[0] for c in hubspot.calls] == ["POST"]


@pytest.mark.parametrize("failure", ["500", "network"])
def test_hubspot_failing_never_blocks_the_deletion(app, client, hubspot, caplog, failure):
    from padel_app.models import User

    hubspot.contacts = {"1": {"email": EMAIL}}
    if failure == "500":
        hubspot.fail_with = 500
    else:
        hubspot.raise_exc = requests.ConnectionError("down")
    user_id = _account(app)
    with caplog.at_level(logging.WARNING, logger="padel_app.services.hubspot_sync"):
        _delete(app, client, user_id)

    with app.app_context():
        assert db.session.get(User, user_id).status == "disabled"
    warnings = [r.getMessage() for r in caplog.records if "hubspot" in r.getMessage().lower()]
    assert warnings and not any(EMAIL in w for w in warnings)


def test_a_deleting_student_causes_no_request(app, client, hubspot):
    hubspot.contacts = {"1": {"email": EMAIL}}
    _delete(app, client, _account(app, coach=False))
    assert hubspot.calls == []


def test_no_token_no_traffic(app, client, hubspot, monkeypatch):
    monkeypatch.delenv("HUBSPOT_PRIVATE_APP_TOKEN")
    hubspot.contacts = {"1": {"email": EMAIL}}
    _delete(app, client, _account(app))
    assert hubspot.calls == []


def test_the_archive_runs_after_the_deletion_is_committed(app, client, hubspot, monkeypatch, commits):
    """Criterion: after the commit, with the email captured before anonymising (a second
    connection is no witness here — see the PAD-471 `commits` fixture)."""
    from padel_app.services import hubspot_sync

    user_id = _account(app)
    before = commits["n"]
    seen = []
    monkeypatch.setattr(hubspot_sync, "archive_deleted_coach", lambda email: seen.append((commits["n"], email)))
    _delete(app, client, user_id)
    assert len(seen) == 1
    assert seen[0][0] > before, "the archive was handed off before the deletion was committed"
    assert seen[0][1] == EMAIL
