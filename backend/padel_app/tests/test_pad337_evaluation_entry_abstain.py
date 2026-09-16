"""evaluations.entries rules 6-7 (PAD-337) — a save writes only the scores a
coach actually gave.

The evaluation sheets used to seed every category with its scale midpoint and
post all of them on every save, so a coach who rated one skill persisted a
midpoint "grade" for every other one, and re-posting an unchanged score moved
its `evaluatedAt`. The clients now send only the categories the coach scored;
the backend backs that up for any caller (including App Store builds that
still post the whole set): a null value is an abstention, and a value equal to
the category's latest score adds no history row.
"""
import pytest
from flask_jwt_extended import create_access_token

from padel_app.sql_db import db
from padel_app.tests.test_notification_reminder_flow import _seed_coach_and_student


@pytest.fixture(autouse=True)
def _jwt_secret(app):
    app.config["JWT_SECRET_KEY"] = "test-jwt-secret"


def _headers(app, user_id):
    with app.app_context():
        token = create_access_token(identity=str(user_id))
    return {"Authorization": f"Bearer {token}"}


def _seed(app):
    from padel_app.models import Association_CoachPlayer, EvaluationCategory

    ids = _seed_coach_and_student(app)
    with app.app_context():
        rel = Association_CoachPlayer(coach_id=ids["coach_id"], player_id=ids["student_id"])
        db.session.add(rel)
        forehand = EvaluationCategory(coach_id=ids["coach_id"], name="Forehand", scale_min=1, scale_max=10)
        volley = EvaluationCategory(coach_id=ids["coach_id"], name="Volley", scale_min=1, scale_max=10)
        db.session.add_all([forehand, volley])
        db.session.commit()
        ids.update(rel_id=rel.id, forehand_id=forehand.id, volley_id=volley.id)
    return ids


def _save(app, client, ids, scores):
    res = client.post(
        "/api/app/add_evaluation_entry",
        json={"playerId": ids["student_id"], "scores": scores, "strengths": [], "weaknesses": []},
        headers=_headers(app, ids["coach_user_id"]),
    )
    assert res.status_code == 200, res.get_data(as_text=True)


def _entries(app, ids, category_key):
    from padel_app.models import EvaluationEntry

    with app.app_context():
        return EvaluationEntry.query.filter_by(
            coach_player_id=ids["rel_id"], category_id=ids[category_key]
        ).count()


def test_a_save_with_no_scores_writes_no_entry(app, client):
    ids = _seed(app)
    _save(app, client, ids, [])
    assert _entries(app, ids, "forehand_id") == 0
    assert _entries(app, ids, "volley_id") == 0


def test_a_null_value_is_an_abstention_not_a_score(app, client):
    ids = _seed(app)
    _save(app, client, ids, [
        {"categoryId": ids["forehand_id"], "value": 8},
        {"categoryId": ids["volley_id"], "value": None},
    ])
    assert _entries(app, ids, "forehand_id") == 1
    assert _entries(app, ids, "volley_id") == 0


def test_an_unchanged_score_adds_no_history_row(app, client):
    from padel_app.models import EvaluationEntry

    ids = _seed(app)
    _save(app, client, ids, [{"categoryId": ids["forehand_id"], "value": 8}])
    with app.app_context():
        first = EvaluationEntry.query.filter_by(coach_player_id=ids["rel_id"]).one().evaluated_at

    _save(app, client, ids, [{"categoryId": ids["forehand_id"], "value": 8}])
    assert _entries(app, ids, "forehand_id") == 1
    with app.app_context():
        assert EvaluationEntry.query.filter_by(coach_player_id=ids["rel_id"]).one().evaluated_at == first

    _save(app, client, ids, [{"categoryId": ids["forehand_id"], "value": 9}])
    assert _entries(app, ids, "forehand_id") == 2
