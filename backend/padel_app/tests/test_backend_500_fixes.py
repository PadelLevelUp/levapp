"""
Regression tests for a 500 found during an automated E2E test-health sweep:

`GET /api/app/exercises` and `GET /api/app/exercise-groups` threw
`AttributeError: 'NoneType' object has no attribute 'id'` for any
authenticated caller who is not a coach (e.g. a student), because
`training_service.py` called `.filter_by(coach_id=coach.id)` without
checking whether `coach` was `None`. (The second 500 this file once pinned, the
generic editor's schema route, went with the editor itself in PAD-550.)
"""
import pytest
from flask_jwt_extended import create_access_token

from padel_app.sql_db import db


@pytest.fixture(autouse=True)
def _jwt_secret(app):
    app.config["JWT_SECRET_KEY"] = "test-jwt-secret"


def _auth_header(app, user_id):
    with app.app_context():
        token = create_access_token(identity=str(user_id))
    return {"Authorization": f"Bearer {token}"}


def _make_student_user(app):
    from padel_app.models import User
    from padel_app.models.players import Player

    with app.app_context():
        user = User(name="Student", username="bug500_student", password="x")
        db.session.add(user)
        db.session.flush()

        player = Player(user_id=user.id)
        db.session.add(player)
        db.session.commit()
        return user.id


# ---------------------------------------------------------------------------
# Bug 1 — exercises / exercise-groups 500 for non-coach callers
# ---------------------------------------------------------------------------


def test_exercises_endpoint_does_not_500_for_student(app, client):
    student_user_id = _make_student_user(app)

    response = client.get(
        "/api/app/exercises", headers=_auth_header(app, student_user_id)
    )

    assert response.status_code == 403
    assert response.status_code != 500


def test_exercise_groups_endpoint_does_not_500_for_student(app, client):
    student_user_id = _make_student_user(app)

    response = client.get(
        "/api/app/exercise-groups", headers=_auth_header(app, student_user_id)
    )

    assert response.status_code == 403
    assert response.status_code != 500


def test_exercises_endpoint_still_works_for_coach(app, client):
    from padel_app.tests.helpers import make_coach
    from padel_app.models.coaches import Coach

    coach_id = make_coach(app)
    with app.app_context():
        coach_user_id = db.session.get(Coach, coach_id).user_id

    response = client.get(
        "/api/app/exercises", headers=_auth_header(app, coach_user_id)
    )

    assert response.status_code == 200
    assert response.get_json() == []


def test_exercise_groups_endpoint_still_works_for_coach(app, client):
    from padel_app.tests.helpers import make_coach
    from padel_app.models.coaches import Coach

    coach_id = make_coach(app)
    with app.app_context():
        coach_user_id = db.session.get(Coach, coach_id).user_id

    response = client.get(
        "/api/app/exercise-groups", headers=_auth_header(app, coach_user_id)
    )

    assert response.status_code == 200
    assert response.get_json() == []


def test_create_exercise_endpoint_does_not_500_for_student(app, client):
    """The write path (`create_exercise_service`) has the same `coach.id`
    dereference as the GET path — guard it the same way for consistency."""
    student_user_id = _make_student_user(app)

    response = client.post(
        "/api/app/exercises",
        json={"name": "Sneaky", "type": "drill"},
        headers=_auth_header(app, student_user_id),
    )

    assert response.status_code == 403
    assert response.status_code != 500


def test_create_exercise_group_endpoint_does_not_500_for_student(app, client):
    student_user_id = _make_student_user(app)

    response = client.post(
        "/api/app/exercise-groups",
        json={"name": "Sneaky Group"},
        headers=_auth_header(app, student_user_id),
    )

    assert response.status_code == 403
    assert response.status_code != 500
