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


@pytest.mark.parametrize("switch, expected", [(True, "default"), (False, None)])
def test_the_expo_payload_carries_the_sound_per_recipient(app, switch, expected):
    from padel_app.models import User
    from padel_app.services.messaging_service import create_message_service

    with app.app_context():
        sender, recipient, conversation = _dm_fixture("Ana Coach", "Bruno Player", f"pad680{int(switch)}")
        db.session.get(User, recipient.id).notif_sound = switch
        db.session.commit()
        with patch("padel_app.services.messaging_service.publish"), \
             patch("padel_app.services.messaging_service.send_push_notification"), \
             patch("padel_app.utils.expo_push.requests.post") as mock_post:
            mock_post.return_value = _mock_response({"data": [{"status": "ok"}]})
            create_message_service({"conversationId": conversation.id, "text": "Treino às 19h"}, sender.id)

    (message,) = mock_post.call_args.kwargs["json"]
    assert message.get("sound") == expected
    assert ("sound" in message) is (expected is not None)
