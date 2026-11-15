"""PAD-837b: the coach's saved Presences view (settings.coach-presences-view rules 1-2)."""
import pytest
from flask_jwt_extended import create_access_token

from padel_app.sql_db import db

URL = "/api/app/coach/presences-view"


@pytest.fixture
def tokens(app):
    from padel_app.models import User
    from padel_app.models.coaches import Coach
    from padel_app.models.players import Player

    app.config["JWT_SECRET_KEY"] = "test-jwt-secret"
    with app.app_context():
        coach_user = User(name="View Coach", username="view_coach", password="x")
        student_user = User(name="View Student", username="view_student", password="x")
        db.session.add_all([coach_user, student_user])
        db.session.flush()
        db.session.add_all([Coach(user_id=coach_user.id), Player(user_id=student_user.id)])
        db.session.commit()
        return {
            "coach": {"Authorization": f"Bearer {create_access_token(identity=str(coach_user.id))}"},
            "student": {"Authorization": f"Bearer {create_access_token(identity=str(student_user.id))}"},
        }


def _put(client, tokens, value):
    return client.put(URL, json={"presencesView": value}, headers=tokens["coach"])


def _get(client, tokens):
    return client.get(URL, headers=tokens["coach"])


@pytest.mark.criterion("SETTINGS-COACH-PRESENCES-VIEW-1")
def test_a_coach_saves_and_reads_back_the_view(client, tokens):
    assert _get(client, tokens).get_json() == {"presencesView": None}

    view = {"columns": ["total", "presenceMinutes", "justified"]}
    saved = _put(client, tokens, view)
    assert saved.status_code == 200 and saved.get_json() == {"presencesView": view}
    assert _get(client, tokens).get_json() == {"presencesView": view}

    assert _put(client, tokens, None).get_json() == {"presencesView": None}
    assert _get(client, tokens).get_json() == {"presencesView": None}

    # A student reaches neither route.
    assert client.get(URL, headers=tokens["student"]).status_code == 403
    assert client.put(URL, json={"presencesView": view}, headers=tokens["student"]).status_code == 403
    assert _get(client, tokens).get_json() == {"presencesView": None}, "the refused PUT stored nothing"


@pytest.mark.criterion("SETTINGS-COACH-PRESENCES-VIEW-2")
def test_a_malformed_view_is_refused(client, tokens):
    stored = {"columns": ["total", "justified"]}
    assert _put(client, tokens, stored).status_code == 200

    malformed = [
        {"columns": "total"},
        {"columns": ["total", "total"]},
        {"columns": [f"c{i}" for i in range(33)]},
        {"columns": ["x" * 41]},
        {"columns": ["total", 7]},
        {"columns": None},
        {},
        "total",
    ]
    for bad in malformed:
        res = _put(client, tokens, bad)
        assert res.status_code == 400, bad
        assert res.get_json()["code"] == "INVALID_PRESENCES_VIEW", bad
        assert _get(client, tokens).get_json() == {"presencesView": stored}, f"{bad!r} must store nothing"

    # A body without the key is not "clear it".
    res = client.put(URL, json={}, headers=tokens["coach"])
    assert res.status_code == 400 and res.get_json()["code"] == "INVALID_PRESENCES_VIEW"
    assert _get(client, tokens).get_json() == {"presencesView": stored}

    # The limits themselves, and an id no shell knows, are accepted.
    edge = {"columns": [f"c{i}" for i in range(31)] + ["x" * 40]}
    assert _put(client, tokens, edge).status_code == 200
    unknown = {"columns": ["retiredColumn"]}
    assert _put(client, tokens, unknown).get_json() == {"presencesView": unknown}
    assert _put(client, tokens, {"columns": []}).get_json() == {"presencesView": {"columns": []}}
