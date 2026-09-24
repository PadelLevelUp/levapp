"""PAD-418 (B-167) — auth.logout rule 4: the logout request itself removes the
caller's push-token row, inside the same authenticated request, so a phone
cannot stay on the old account's pushes because an unregister DELETE lost the
race with the revocation. Optional and backward compatible: a logout with no
body (App Store 1.0/1.1.0) behaves exactly as before. messaging.push-notifications
rule 9 stands: only the CALLER's (user, token) row is ever touched."""
from werkzeug.security import generate_password_hash

from padel_app.sql_db import db
from padel_app.tests.test_token_hygiene import _hdr, _jwt_secret, _token, coach  # noqa: F401 (fixtures)

TOKEN = "ExponentPushToken[pad418]"


def _other_user(app):
    from padel_app.models import User

    with app.app_context():
        user = User(name="Other", username="other418", email="other418@example.com",
                    password=generate_password_hash("SecurePass1!"), status="active")
        db.session.add(user)
        db.session.commit()
        return user.id


def _rows(app, token=TOKEN):
    from padel_app.models import DeviceToken

    with app.app_context():
        return sorted(r.user_id for r in DeviceToken.query.filter_by(token=token).all())


def _register(client, app, user_id, token=TOKEN):
    res = client.post("/api/notifications/device", headers=_hdr(_token(app, user_id)),
                      json={"token": token, "platform": "ios"})
    assert res.status_code == 200


def test_logout_with_the_push_token_removes_the_callers_row(client, app, coach):
    _register(client, app, coach)
    assert _rows(app) == [coach]  # the subject exists before the act (R-032)
    res = client.post("/api/auth/logout", headers=_hdr(_token(app, coach)), json={"pushToken": TOKEN})
    assert res.status_code == 200
    assert _rows(app) == []


def test_logout_without_a_body_leaves_the_row_as_before(client, app, coach):
    # App Store 1.0/1.1.0 post /auth/logout with no body: nothing changes for them.
    _register(client, app, coach)
    res = client.post("/api/auth/logout", headers=_hdr(_token(app, coach)))
    assert res.status_code == 200
    assert res.get_json() == {"message": "Successfully logged out"}
    assert _rows(app) == [coach]


def _seed_row(app, user_id, token=TOKEN):
    """A row written straight to the table: the pre-D137 duplicate (two users on one token)
    that registration can no longer create but production still holds until it heals."""
    from padel_app.models import DeviceToken

    with app.app_context():
        db.session.add(DeviceToken(user_id=user_id, token=token, platform="ios"))
        db.session.commit()


def test_logout_never_touches_another_users_row_for_the_same_token(client, app, coach):
    other = _other_user(app)
    _seed_row(app, coach)
    _seed_row(app, other)
    assert _rows(app) == sorted([coach, other])
    client.post("/api/auth/logout", headers=_hdr(_token(app, coach)), json={"pushToken": TOKEN})
    assert _rows(app) == [other]


def test_logout_cannot_delete_a_token_the_caller_never_registered(client, app, coach):
    other = _other_user(app)
    _register(client, app, other)
    res = client.post("/api/auth/logout", headers=_hdr(_token(app, coach)), json={"pushToken": TOKEN})
    assert res.status_code == 200
    assert _rows(app) == [other]
