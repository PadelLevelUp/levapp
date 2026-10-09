"""PAD-532 admin.approvals-and-users rule 9: "view as", read-only.

An operator (exactly) mints a 30-minute product token for a user; under it the product backend
refuses every write, rolls back anything a GET would have written, sends no mail, push, live event
or CRM call, hides messaging entirely, and never refreshes the token."""
from datetime import datetime, timezone

import jwt
import pytest
from flask import jsonify

from padel_app.sql_db import db
from padel_app.tests.admin_helpers import admin_token, audit_rows, bearer, make_role, make_user, signing


def _view_as(client, app, user_id, role="operator"):
    token = admin_token(app, make_role(app, f"{role}@levapp.app", role))
    return client.post(f"/admin/api/users/{user_id}/view-as", headers=bearer(token))


def _token_from(resp):
    url = resp.get_json()["url"]
    assert "/view-as#" in url
    return url.split("#", 1)[1]


def test_view_as_mints_a_short_read_only_token_and_is_audited(app, client):
    app.config["PUBLIC_WEB_ORIGIN"] = "https://staging.levapp.app"
    maria = make_user(app, "maria", "maria@example.com")
    r = _view_as(client, app, maria)
    assert r.status_code == 200
    assert r.get_json()["url"].startswith("https://staging.levapp.app/view-as#")
    claims = jwt.decode(_token_from(r), app.config["JWT_SECRET_KEY"], algorithms=["HS256"])
    assert claims["sub"] == str(maria) and claims["view_as"] is True and claims["actor"] == "operator@levapp.app"
    assert "aud" not in claims  # a product token, not a console one
    assert 29 * 60 <= claims["exp"] - claims["iat"] <= 30 * 60
    rows = audit_rows(app, "user.view_as")
    assert len(rows) == 1 and rows[0]["outcome"] == "ok" and rows[0]["targetId"] == str(maria)


@pytest.mark.parametrize("role", ["support", "owner"])
def test_view_as_is_for_operators_only(app, client, role):
    maria = make_user(app, "maria", "maria@example.com")
    r = _view_as(client, app, maria, role=role)
    assert r.status_code == 403 and r.get_json() == {"error": "ADMIN_ROLE_TOO_LOW"}
    assert [a["outcome"] for a in audit_rows(app, "user.view_as")] == ["denied"]


def test_reads_work_and_writes_are_refused(app, client):
    maria = make_user(app, "maria", "maria@example.com")
    token = _token_from(_view_as(client, app, maria))
    me = client.get("/api/auth/me", headers=bearer(token))
    assert me.status_code == 200 and me.get_json()["id"] == maria
    for method, path in (("PATCH", "/api/auth/me"), ("POST", "/api/app/conversation"), ("DELETE", "/api/auth/me"), ("PUT", "/api/app/message/1")):
        r = client.open(path, method=method, headers=bearer(token), json={"language": "en"})
        assert r.status_code == 403 and r.get_json() == {"error": "VIEW_AS_READ_ONLY"}, (method, path)
    from padel_app.models import User

    with app.app_context():
        assert User.query.get(maria).language == "pt" and User.query.get(maria).status == "active"


@pytest.mark.parametrize("path", ["/api/app/conversations", "/api/app/messages/unread_count", "/api/app/messageable-users", "/api/app/conversation/1"])
def test_private_messages_are_never_shown(app, client, path):
    maria = make_user(app, "maria", "maria@example.com")
    token = _token_from(_view_as(client, app, maria))
    r = client.get(path, headers=bearer(token))
    assert r.status_code == 403 and r.get_json() == {"error": "VIEW_AS_READ_ONLY"}


def test_the_message_stream_is_refused_with_the_token_in_the_query(app, client):
    maria = make_user(app, "maria", "maria@example.com")
    token = _token_from(_view_as(client, app, maria))
    r = client.get(f"/api/app/events?token={token}")
    assert r.status_code == 403 and r.get_json() == {"error": "VIEW_AS_READ_ONLY"}


def test_a_get_that_writes_leaves_nothing_behind_and_sends_nothing(app, client, monkeypatch):
    """The rollback rule, on a GET that commits a row and fires every side-effect channel
    (the lazy materialisation of a recurring class is one such GET in the product)."""
    from padel_app.models import TokenBlocklist
    from padel_app.realtime import publish
    from padel_app.services import hubspot_sync
    from padel_app.tools import email_tools
    from padel_app.utils import expo_push, push_notifications

    def writes_on_get():
        db.session.add(TokenBlocklist(jti="written-by-a-get"))
        db.session.commit()
        email_tools.send_email("s", ["x@example.com"], body="b")
        push_notifications.send_push_notification(maria, "t", "b", url="/")
        expo_push.send_expo_push_to_user(maria, "t", "b", data={"type": "path", "path": "/"})
        publish({"type": "probe"}, [maria])
        hubspot_sync._trigger(None, None, move_deals=False)
        return jsonify({"ok": True})

    app.add_url_rule("/api/app/_test_writes_on_get", "writes_on_get", writes_on_get)
    maria = make_user(app, "maria", "maria@example.com")
    token = _token_from(_view_as(client, app, maria))

    from padel_app.utils import view_as

    r = client.get("/api/app/_test_writes_on_get", headers=bearer(token))
    assert r.status_code == 200
    with app.app_context():
        assert TokenBlocklist.query.filter_by(jti="written-by-a-get").first() is None
    assert view_as.SUPPRESSED_LAST_REQUEST == {"email": 1, "webpush": 1, "expo": 1, "realtime": 1, "crm": 1}


def test_the_token_is_never_refreshed(app, client):
    from flask_jwt_extended import create_access_token

    maria = make_user(app, "maria", "maria@example.com")
    token = _token_from(_view_as(client, app, maria))
    r = client.get("/api/auth/me", headers=bearer(token))
    assert "X-New-Token" not in r.headers
    # Control: an ordinary near-expiry token IS refreshed, so the check above can fail.
    from datetime import timedelta

    with app.app_context():
        near = create_access_token(identity=str(maria), expires_delta=timedelta(days=1), additional_claims={"auth_time": int(datetime.now(timezone.utc).timestamp())})
    assert "X-New-Token" in client.get("/api/auth/me", headers=bearer(near)).headers


def test_a_normal_session_is_untouched(app, client):
    from flask_jwt_extended import create_access_token

    maria = make_user(app, "maria", "maria@example.com")
    with app.app_context():
        token = create_access_token(identity=str(maria))
    assert client.patch("/api/auth/me", headers=bearer(token), json={"language": "en"}).status_code == 200
    assert client.get("/api/app/conversations", headers=bearer(token)).status_code == 200
