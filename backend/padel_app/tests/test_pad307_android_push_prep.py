"""PAD-307 — Android wave C prep (messaging.push-notifications rule 11).

- The Expo payload carries channelId/priority for Android heads-up delivery.
- EXPO_ACCESS_TOKEN adds a bearer header only when set and non-empty.
- POST /api/notifications/device validates `platform` (ios|android) and records it.
"""
from unittest.mock import MagicMock, patch

from flask_jwt_extended import create_access_token

from padel_app.sql_db import db


def _auth_header(app, user_id):
    app.config["JWT_SECRET_KEY"] = "pad307-test-secret"  # as test_native_push._jwt_secret does
    with app.app_context():
        token = create_access_token(identity=str(user_id))
    return {"Authorization": f"Bearer {token}"}


def _create_user(username):
    from padel_app.models import User

    user = User(
        name=username,
        username=username,
        email=f"{username}@example.com",
        password="x",
        status="active",
    )
    db.session.add(user)
    db.session.commit()
    return user.id


def _ok_response(n):
    resp = MagicMock()
    resp.raise_for_status = MagicMock()
    resp.json.return_value = {"data": [{"status": "ok"}] * n}
    return resp


def _send(app, monkeypatch, token_env):
    from padel_app.utils.expo_push import send_expo_push

    if token_env is None:
        monkeypatch.delenv("EXPO_ACCESS_TOKEN", raising=False)
    else:
        monkeypatch.setenv("EXPO_ACCESS_TOKEN", token_env)
    with app.app_context():
        with patch("padel_app.utils.expo_push.requests.post") as mock_post:
            mock_post.return_value = _ok_response(1)
            assert send_expo_push(["ExponentPushToken[a]"], "Hello", "World", {"type": "message", "conversationId": 7}) is True
    _, kwargs = mock_post.call_args
    return kwargs


def test_payload_carries_android_channel_and_high_priority(app, monkeypatch):
    kwargs = _send(app, monkeypatch, None)
    assert kwargs["json"] == [
        {
            "to": "ExponentPushToken[a]",
            "title": "Hello",
            "body": "World",
            "data": {"type": "message", "conversationId": 7},
            "channelId": "default",
            "priority": "high",
        }
    ]


def test_no_authorization_header_when_access_token_unset_or_empty(app, monkeypatch):
    for value in (None, "", "   "):
        kwargs = _send(app, monkeypatch, value)
        assert "Authorization" not in kwargs["headers"], value
        assert kwargs["headers"] == {"Accept": "application/json", "Content-Type": "application/json"}


def test_bearer_header_when_access_token_set(app, monkeypatch):
    kwargs = _send(app, monkeypatch, "abc")
    assert kwargs["headers"]["Authorization"] == "Bearer abc"
    assert kwargs["json"][0]["to"] == "ExponentPushToken[a]"
    # The body is the same with or without the token.
    assert kwargs["json"] == _send(app, monkeypatch, None)["json"]


def test_platform_android_is_recorded_and_refreshed(client, app):
    from padel_app.models import DeviceToken

    with app.app_context():
        user_id = _create_user("pad307-android")
    headers = _auth_header(app, user_id)

    resp = client.post("/api/notifications/device", json={"token": "ExponentPushToken[droid]", "platform": "android"}, headers=headers)
    assert resp.status_code == 200
    with app.app_context():
        row = DeviceToken.query.filter_by(user_id=user_id, token="ExponentPushToken[droid]").one()
        assert row.platform == "android"

    resp = client.post("/api/notifications/device", json={"token": "ExponentPushToken[droid]", "platform": "ios"}, headers=headers)
    assert resp.status_code == 200
    with app.app_context():
        rows = DeviceToken.query.filter_by(user_id=user_id).all()
        assert [r.platform for r in rows] == ["ios"]


def test_platform_missing_or_unknown_is_rejected(client, app):
    from padel_app.models import DeviceToken

    with app.app_context():
        user_id = _create_user("pad307-badplatform")
    headers = _auth_header(app, user_id)

    bodies = [
        {"token": "ExponentPushToken[x1]"},
        {"token": "ExponentPushToken[x2]", "platform": ""},
        {"token": "ExponentPushToken[x3]", "platform": "web"},
        {"token": "ExponentPushToken[x4]", "platform": "IOS"},
        {"token": "ExponentPushToken[x5]", "platform": 3},
    ]
    for body in bodies:
        resp = client.post("/api/notifications/device", json=body, headers=headers)
        assert resp.status_code == 400, body
    with app.app_context():
        assert DeviceToken.query.filter_by(user_id=user_id).count() == 0
