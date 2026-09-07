"""auth.register rule 9 (amended 2026-09-07): GET /api/auth/me exposes a student's coaches."""

from flask_jwt_extended import create_access_token

from padel_app.sql_db import db


def _header(app, user_id):
    app.config["JWT_SECRET_KEY"] = "test-jwt-secret"
    with app.app_context():
        token = create_access_token(identity=str(user_id))
    return {"Authorization": f"Bearer {token}"}


def _seed(app):
    from padel_app.models import Association_CoachPlayer, User
    from padel_app.models.coaches import Coach
    from padel_app.models.players import Player

    with app.app_context():
        u_coach = User(name="Zara Coach", username="zara", password="x", status="active")
        u_coach2 = User(name="Abel Coach", username="abel", password="x", status="active")
        u_student = User(name="Student One", username="stud1", password="x", status="active")
        u_lonely = User(name="Lonely Student", username="lonely", password="x", status="active")
        db.session.add_all([u_coach, u_coach2, u_student, u_lonely])
        db.session.flush()
        c1 = Coach(user_id=u_coach.id, approval_status="approved")
        c2 = Coach(user_id=u_coach2.id, approval_status="approved")
        p1 = Player(user_id=u_student.id)
        p2 = Player(user_id=u_lonely.id)
        db.session.add_all([c1, c2, p1, p2])
        db.session.flush()
        db.session.add(Association_CoachPlayer(coach_id=c1.id, player_id=p1.id))
        db.session.add(Association_CoachPlayer(coach_id=c2.id, player_id=p1.id))
        db.session.commit()
        return {
            "coach": u_coach.id, "coach_id": c1.id, "coach2_id": c2.id,
            "student": u_student.id, "lonely": u_lonely.id,
        }


def test_student_on_a_roster_sees_their_coaches_sorted_by_name(client, app):
    ids = _seed(app)
    res = client.get("/api/auth/me", headers=_header(app, ids["student"]))
    assert res.status_code == 200
    assert res.get_json()["coaches"] == [
        {"id": ids["coach2_id"], "name": "Abel Coach"},
        {"id": ids["coach_id"], "name": "Zara Coach"},
    ]


def test_student_with_no_roster_has_no_coaches(client, app):
    ids = _seed(app)
    res = client.get("/api/auth/me", headers=_header(app, ids["lonely"]))
    assert res.get_json()["coaches"] == []


def test_coach_has_an_empty_coaches_list(client, app):
    ids = _seed(app)
    res = client.get("/api/auth/me", headers=_header(app, ids["coach"]))
    assert res.get_json()["coaches"] == []
    assert res.get_json()["clubs"] == []
