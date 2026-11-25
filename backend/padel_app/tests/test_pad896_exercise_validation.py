"""PAD-896, training.exercises rules 1 and 3: the server, not only the form, refuses an exercise type
outside the model's list and a difficulty outside 1 to 5, on create and on edit. Before, the database
enum was the only check on type (a missing type was a KeyError, a 500) and nothing checked difficulty."""
import pytest
from flask_jwt_extended import create_access_token

from padel_app.sql_db import db


@pytest.fixture(autouse=True)
def _jwt_secret(app):
    app.config["JWT_SECRET_KEY"] = "test-jwt-secret"


def _coach_headers(app):
    from padel_app.models.coaches import Coach
    from padel_app.tests.helpers import make_coach

    coach_id = make_coach(app)
    with app.app_context():
        token = create_access_token(identity=str(db.session.get(Coach, coach_id).user_id))
    return {"Authorization": f"Bearer {token}"}


def _count(app):
    from padel_app.models.exercise import Exercise

    with app.app_context():
        return Exercise.query.count()


VALID = {"name": "Bandeja drill", "type": "volley", "difficulty": 5}


@pytest.mark.criterion("TRAINING-EXERCISES-8")
@pytest.mark.parametrize("body", [
    {"name": "No type", "difficulty": 3},
    {**VALID, "type": "smash"},
    {**VALID, "difficulty": 0},
    {**VALID, "difficulty": 6},
    {**VALID, "difficulty": 2.5},
])
def test_create_refuses_a_type_or_difficulty_outside_the_rules(app, client, body):
    headers = _coach_headers(app)
    response = client.post("/api/app/exercises", headers=headers, json=body)
    assert response.status_code == 400, response.get_data(as_text=True)
    assert _count(app) == 0


@pytest.mark.criterion("TRAINING-EXERCISES-8")
def test_create_accepts_a_listed_type_and_difficulty_5(app, client):
    response = client.post("/api/app/exercises", headers=_coach_headers(app), json=VALID)
    assert response.status_code == 201, response.get_data(as_text=True)
    assert _count(app) == 1


@pytest.mark.criterion("TRAINING-EXERCISES-8")
@pytest.mark.parametrize("change", [{"type": "smash"}, {"difficulty": 0}])
def test_edit_refuses_a_type_or_difficulty_outside_the_rules(app, client, change):
    from padel_app.models.exercise import Exercise

    headers = _coach_headers(app)
    created = client.post("/api/app/exercises", headers=headers, json=VALID).get_json()
    response = client.put(f"/api/app/exercises/{created['id']}", headers=headers, json=change)
    assert response.status_code == 400, response.get_data(as_text=True)
    with app.app_context():
        exercise = db.session.get(Exercise, created["id"])
        assert (exercise.type, exercise.difficulty) == ("volley", 5)
