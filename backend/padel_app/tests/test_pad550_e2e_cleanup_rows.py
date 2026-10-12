"""PAD-550 — the E2E/Maestro cleanup routes that replace the retired generic editor.

`GET /api/app/notify/debug/rows/<model>` lists ids and `DELETE …/rows/<model>/<id>` deletes one
row, for a fixed allow-list of five models only, behind the E2E_DEBUG_ENDPOINTS flag and a JWT.
"""
import pytest
from flask_jwt_extended import create_access_token

from padel_app.sql_db import db

BASE = "/api/app/notify/debug/rows"


@pytest.fixture
def world(app):
    from padel_app.models import Club, User

    app.config["JWT_SECRET_KEY"] = "test-jwt-secret"
    with app.app_context():
        user = User(name="E2E Coach", username="e2e-coach", password="x")
        clubs = [Club(name=f"PAD550 Club {i}", description="", location="City") for i in range(2)]
        db.session.add_all([user, *clubs])
        db.session.commit()
        token = create_access_token(identity=str(user.id))
        return {"auth": {"Authorization": f"Bearer {token}"}, "club_ids": [c.id for c in clubs], "user_id": user.id}


def _on(app):
    app.config["E2E_DEBUG_ENDPOINTS"] = "true"


def test_off_the_flag_both_routes_are_404(app, world):
    app.config["E2E_DEBUG_ENDPOINTS"] = None
    client = app.test_client()
    assert client.get(f"{BASE}/club", headers=world["auth"]).status_code == 404
    assert client.delete(f"{BASE}/club/{world['club_ids'][0]}", headers=world["auth"]).status_code == 404
    with app.app_context():
        from padel_app.models import Club

        assert db.session.get(Club, world["club_ids"][0]) is not None, "nothing deleted with the flag off"


def test_a_model_outside_the_allow_list_is_refused(app, world):
    _on(app)
    client = app.test_client()
    for model in ("user", "users", "coach", "tokenblocklist", "adminrole"):
        assert client.get(f"{BASE}/{model}", headers=world["auth"]).status_code == 404, model
        assert client.delete(f"{BASE}/{model}/{world['user_id']}", headers=world["auth"]).status_code == 404, model
    with app.app_context():
        from padel_app.models import User

        assert db.session.get(User, world["user_id"]) is not None, "a user is never deleted here"


def test_an_anonymous_caller_is_refused(app, world):
    _on(app)
    assert app.test_client().get(f"{BASE}/club").status_code == 401


def test_list_then_delete_an_allow_listed_row(app, world):
    _on(app)
    client = app.test_client()
    listed = client.get(f"{BASE}/Club", headers=world["auth"])
    assert listed.status_code == 200
    assert set(world["club_ids"]) <= set(listed.get_json()["ids"])

    gone = world["club_ids"][0]
    assert client.delete(f"{BASE}/club/{gone}", headers=world["auth"]).status_code == 200
    assert client.delete(f"{BASE}/club/{gone}", headers=world["auth"]).status_code == 404, "idempotent cleanup"
    after = client.get(f"{BASE}/club", headers=world["auth"]).get_json()["ids"]
    assert gone not in after and world["club_ids"][1] in after
