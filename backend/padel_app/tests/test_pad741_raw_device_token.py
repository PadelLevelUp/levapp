"""PAD-741 (B-706) — messaging.push-notifications rule 9b: only an Expo push token is registered.
iOS build 34's rotation listener posted the raw APNs device token (64 hex characters); Expo answers
DeviceNotRegistered for it, so it was inserted, failed and deleted on every launch, and the
logout's revoke named the raw token while the account's Expo token stayed on the phone (the B-167
shape). The server now stores only Expo-shaped tokens, and a revoke that names any other token
removes every Expo row the caller holds (auth.logout rule 4)."""
import logging

import pytest
from werkzeug.security import generate_password_hash

from padel_app.sql_db import db
from padel_app.tests.test_token_hygiene import _hdr, _jwt_secret, _token, coach  # noqa: F401 (fixtures)

EXPO = "ExponentPushToken[pad741]"
EXPO_2 = "ExponentPushToken[pad741-second-phone]"
RAW = "a3f1" * 16  # the 64-hex raw APNs device token build 34 posted


def _other_user(app):
    from padel_app.models import User

    with app.app_context():
        user = User(name="Other", username="other741", email="other741@example.com",
                    password=generate_password_hash("SecurePass1!"), status="active")
        db.session.add(user)
        db.session.commit()
        return user.id


def _tokens(app, user_id):
    from padel_app.models import DeviceToken

    with app.app_context():
        return sorted(r.token for r in DeviceToken.query.filter_by(user_id=user_id).all())


def _seed(app, user_id, token):
    """A row written straight to the table, as prod holds them from before the rule."""
    from padel_app.models import DeviceToken

    with app.app_context():
        db.session.add(DeviceToken(user_id=user_id, token=token, platform="ios"))
        db.session.commit()


def _post(client, app, user_id, token):
    return client.post("/api/notifications/device", headers=_hdr(_token(app, user_id)),
                       json={"token": token, "platform": "ios"})


@pytest.mark.parametrize("token,shape", [
    ("ExponentPushToken[xYz-123]", "expo"),
    ("ExpoPushToken[xYz-123]", "expo"),
    (RAW, "apns_hex64"),
    (RAW.upper(), "apns_hex64"),
    ("not-a-token", "other"),
    ("ExponentPushToken[]", "other"),
    ("", "other"),
    (None, "other"),
])
def test_the_shape_is_decided_in_one_place(token, shape):
    from padel_app.utils.push_token_shape import is_expo_push_token, token_shape

    assert token_shape(token) == shape
    assert is_expo_push_token(token) is (shape == "expo")


def test_a_raw_device_token_is_answered_200_and_not_stored(client, app, coach, caplog):
    with caplog.at_level(logging.INFO, logger="padel_app"):
        res = _post(client, app, coach, RAW)
    assert res.status_code == 200
    assert _tokens(app, coach) == []
    lines = [r.getMessage() for r in caplog.records if "not an Expo push token" in r.getMessage()]
    assert len(lines) == 1
    assert str(coach) in lines[0] and "apns_hex64" in lines[0]
    assert RAW not in lines[0] and RAW[-8:] not in lines[0]


def test_a_raw_token_the_caller_already_held_is_removed(client, app, coach):
    _seed(app, coach, RAW)
    _seed(app, coach, EXPO)
    assert _tokens(app, coach) == sorted([EXPO, RAW])  # the subject exists before the act (R-032)
    assert _post(client, app, coach, RAW).status_code == 200
    assert _tokens(app, coach) == [EXPO]


def test_an_expo_token_is_still_stored(client, app, coach):
    assert _post(client, app, coach, EXPO).status_code == 200
    assert _tokens(app, coach) == [EXPO]


def test_unregister_with_a_raw_token_removes_every_expo_row_of_the_caller(client, app, coach):
    other = _other_user(app)
    _seed(app, coach, EXPO)
    _seed(app, coach, EXPO_2)
    _seed(app, coach, RAW)
    _seed(app, other, "ExponentPushToken[other741]")
    res = client.delete("/api/notifications/device", headers=_hdr(_token(app, coach)), json={"token": RAW})
    assert res.status_code == 200
    assert _tokens(app, coach) == []
    assert _tokens(app, other) == ["ExponentPushToken[other741]"]


def test_unregister_with_an_expo_token_removes_only_that_row(client, app, coach):
    _seed(app, coach, EXPO)
    _seed(app, coach, EXPO_2)
    res = client.delete("/api/notifications/device", headers=_hdr(_token(app, coach)), json={"token": EXPO})
    assert res.status_code == 200
    assert _tokens(app, coach) == [EXPO_2]


def test_logout_with_a_raw_push_token_removes_every_expo_row_of_the_caller(client, app, coach):
    other = _other_user(app)
    _seed(app, coach, EXPO)
    _seed(app, other, EXPO)  # a pre-D137 duplicate on the same Expo token: not the caller's
    res = client.post("/api/auth/logout", headers=_hdr(_token(app, coach)), json={"pushToken": RAW})
    assert res.status_code == 200
    assert _tokens(app, coach) == []
    assert _tokens(app, other) == [EXPO]


def test_logout_with_an_expo_push_token_is_unchanged(client, app, coach):
    _seed(app, coach, EXPO)
    _seed(app, coach, EXPO_2)
    res = client.post("/api/auth/logout", headers=_hdr(_token(app, coach)), json={"pushToken": EXPO})
    assert res.status_code == 200
    assert _tokens(app, coach) == [EXPO_2]
