"""
PAD-500 / B-268 — the general user list answers with the caller's messageable set, not everyone.

`GET /api/app/users` required only a signed-in caller and returned every active user with
username and role. No current screen or installed build (1.0–1.2.1) calls it, but the route
stays: an unknown old caller gets a shorter list, never an error. It now returns exactly the
picker's set (`get_messageable_users_service`, messaging.conversations rule 7), in the same
public shape (serialize_user_public, rule 15).
"""
import pytest

from padel_app.sql_db import db
from padel_app.tests.test_pad483_student_coach_scope import (  # noqa: F401 (fixtures)
    _auth_header,
    _jwt_secret,
    scope,
)

PUBLIC_KEYS = {"id", "name", "username", "role", "isActive"}


def _ids(client, app, user_id, path):
    resp = client.get(path, headers=_auth_header(app, user_id))
    assert resp.status_code == 200
    return resp.get_json()


@pytest.fixture
def other_student(app):
    from padel_app.models import User
    from padel_app.models.players import Player

    with app.app_context():
        user = User(name="S500 Other", username="s500_other_student", password="x", status="active")
        db.session.add(user)
        db.session.flush()
        db.session.add(Player(user_id=user.id))
        db.session.commit()
        return user.id


def test_a_student_never_sees_an_unlinked_coach_or_another_student(client, app, scope, other_student):
    body = _ids(client, app, scope["student_user_id"], "/api/app/users")
    listed = {int(u["id"]) for u in body}
    assert scope["user_ids"]["stranger"] not in listed
    assert other_student not in listed
    assert scope["student_user_id"] not in listed


def test_the_list_is_exactly_the_picker_set(client, app, scope):
    for user_id in (scope["student_user_id"], scope["user_ids"]["roster"]):
        users = {int(u["id"]) for u in _ids(client, app, user_id, "/api/app/users")}
        picker = {int(u["id"]) for u in _ids(client, app, user_id, "/api/app/messageable-users")}
        assert users == picker


def test_the_shape_is_unchanged(client, app, scope):
    """Old builds typed the response as the public User; every entry keeps exactly those keys."""
    body = _ids(client, app, scope["student_user_id"], "/api/app/users")
    assert body, "a linked student must still get a list"
    for entry in body:
        assert set(entry) >= PUBLIC_KEYS
        assert not ({"email", "phone", "language"} & set(entry))
