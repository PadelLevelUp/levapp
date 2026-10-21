"""PAD-680 — notifications.notification-sound: the per-user switch (rule 1) and the `sound` on Expo
pushes (rule 5). The web chime and the iOS handler are covered by their own unit tests.

    pytest padel_app/tests/test_pad680_notification_sound.py -v
"""
from unittest.mock import patch

import pytest
from flask_jwt_extended import create_access_token

from padel_app.sql_db import db
from padel_app.tests.test_native_push import _dm_fixture, _mock_response


@pytest.fixture(autouse=True)
def _jwt_secret(app):
    if not app.config.get("JWT_SECRET_KEY"):
        app.config["JWT_SECRET_KEY"] = "test-jwt-secret"


def _headers(app, username):
    from padel_app.models import User

    with app.app_context():
        user = User(name="Sound", username=username, password="x", status="active")
        db.session.add(user)
        db.session.commit()
        return {"Authorization": f"Bearer {create_access_token(identity=str(user.id))}"}


def test_the_switch_defaults_on_and_is_saved(client, app):
    headers = _headers(app, "sound-680")

    assert client.get("/api/auth/me", headers=headers).get_json()["notificationSound"] is True
    res = client.patch("/api/auth/me", json={"notificationSound": False}, headers=headers)
    assert res.status_code == 200
    assert res.get_json()["notificationSound"] is False
    assert client.get("/api/auth/me", headers=headers).get_json()["notificationSound"] is False


def test_a_non_boolean_switch_is_refused(client, app):
    headers = _headers(app, "sound-680-bad")

    assert client.patch("/api/auth/me", json={"notificationSound": "no"}, headers=headers).status_code == 400


def _send_dm(app, slug, *, switch=True, capable=True, kill=False):
    """A DM to a recipient whose one iOS token is (or is not) sound-capable; answers the Expo body."""
    from padel_app.models import DeviceToken, User
    from padel_app.services.messaging_service import create_message_service

    with app.app_context():
        sender, recipient, conversation = _dm_fixture("Ana Coach", "Bruno Player", slug)
        db.session.get(User, recipient.id).notif_sound = switch
        DeviceToken.query.filter_by(user_id=recipient.id).one().sound_capable = capable
        db.session.commit()
        if kill:
            from padel_app.services.app_settings_service import set_capability_switch
            from padel_app.utils.client_capabilities import reset_switch_cache

            set_capability_switch("notification-sound", True, "test", updated_by_user_id=None)
            db.session.commit()  # the service only flushes: the admin route commits with its audit row
            reset_switch_cache()
        with patch("padel_app.services.messaging_service.publish"), \
             patch("padel_app.services.messaging_service.send_push_notification"), \
             patch("padel_app.utils.expo_push.requests.post") as mock_post:
            mock_post.return_value = _mock_response({"data": [{"status": "ok"}]})
            create_message_service({"conversationId": conversation.id, "text": "Treino às 19h"}, sender.id)
        if kill:
            from padel_app.utils.client_capabilities import reset_switch_cache

            reset_switch_cache()
    (message,) = mock_post.call_args.kwargs["json"]
    return message


def test_a_capable_token_with_the_switch_on_carries_the_sound(app):
    assert _send_dm(app, "pad680on")["sound"] == "default"


@pytest.mark.parametrize("kwargs", [
    {"switch": False},                # the user switched it off (rule 1)
    {"capable": False},               # an older build (1.3.1 and before) registered the token (rule 5)
    {"kill": True},                   # the capability is switched off server-side (PAD-533)
], ids=["switch-off", "old-build", "kill-switch"])
def test_otherwise_the_push_is_silent(app, kwargs):
    assert "sound" not in _send_dm(app, f"pad680-{'-'.join(kwargs)}", **kwargs)


@pytest.mark.parametrize("header, expected", [("notification-sound", True), ("open-spots", False), (None, False)])
def test_registration_stores_what_the_build_declares(client, app, header, expected):
    from padel_app.models import DeviceToken

    headers = _headers(app, f"reg680-{expected}-{header}")
    if header:
        headers["X-LevApp-Capabilities"] = header
    token = f"ExponentPushToken[reg680-{header}]"
    assert client.post("/api/notifications/device", json={"token": token, "platform": "ios"},
                       headers=headers).status_code == 200
    with app.app_context():
        assert DeviceToken.query.filter_by(token=token).one().sound_capable is expected
    # An upgrade re-registers the same token and the flag follows the new build.
    headers["X-LevApp-Capabilities"] = "notification-sound"
    client.post("/api/notifications/device", json={"token": token, "platform": "ios"}, headers=headers)
    with app.app_context():
        assert DeviceToken.query.filter_by(token=token).one().sound_capable is True
