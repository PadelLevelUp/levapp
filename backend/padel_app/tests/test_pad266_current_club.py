"""PAD-266 / B-036 — clubs.crud rule 3: a coach's current club is the most
recently joined one.

`coach_in_club.created_at` is nullable, and Postgres sorts NULLs FIRST in a
descending order while SQLite sorts them last, so these tests pin the rule
independently of the relationship's database order.
"""
from datetime import datetime

from padel_app.sql_db import db


def _coach_with_clubs(app, joins):
    """A coach whose memberships are inserted in the order given: (club, joined_at)."""
    from padel_app.models import Association_CoachClub, Club, User
    from padel_app.models.coaches import Coach

    with app.app_context():
        user = User(name="Two Club Coach", username="pad266", password="x", status="active")
        db.session.add(user)
        db.session.flush()
        coach = Coach(user_id=user.id)
        db.session.add(coach)
        db.session.flush()
        for name, joined in joins:
            club = Club(name=name, description="d", location="l")
            db.session.add(club)
            db.session.flush()
            membership = Association_CoachClub(coach_id=coach.id, club_id=club.id, created_at=joined)
            db.session.add(membership)
            db.session.flush()
            if joined is None:
                # The mixin's Python-side default stamps an explicit None with
                # utcnow on INSERT, so a legacy undated row has to be written
                # as NULL afterwards — the shape old production rows can have.
                db.session.execute(
                    db.text("UPDATE coach_in_club SET created_at = NULL WHERE id = :id"),
                    {"id": membership.id},
                )
        db.session.commit()
        return coach.id, user.id


def _current(app, coach_id):
    from padel_app.models.coaches import Coach

    with app.app_context():
        club = db.session.get(Coach, coach_id).current_club
        return club.name if club else None


def test_the_most_recently_joined_club_is_current(app):
    coach_id, _ = _coach_with_clubs(app, [("Old Club", datetime(2026, 1, 1)), ("New Club", datetime(2026, 9, 1))])
    assert _current(app, coach_id) == "New Club"


def test_join_time_decides_not_insertion_order(app):
    coach_id, _ = _coach_with_clubs(app, [("New Club", datetime(2026, 9, 1)), ("Old Club", datetime(2026, 1, 1))])
    assert _current(app, coach_id) == "New Club"


def test_a_membership_with_no_join_time_counts_as_oldest(app):
    coach_id, _ = _coach_with_clubs(app, [("Dated Club", datetime(2026, 1, 1)), ("Legacy Club", None)])
    assert _current(app, coach_id) == "Dated Club"


def test_equal_join_times_go_to_the_later_membership(app):
    joined = datetime(2026, 5, 1)
    coach_id, _ = _coach_with_clubs(app, [("First Club", joined), ("Second Club", joined)])
    assert _current(app, coach_id) == "Second Club"


def test_the_answer_does_not_depend_on_how_the_database_orders_nulls(app):
    """Hand the property the order Postgres produces (NULLs first in DESC)."""
    from padel_app.models import Association_CoachClub, Club
    from padel_app.models.coaches import Coach

    with app.app_context():
        coach = Coach()
        coach.clubs_relations = [
            Association_CoachClub(club=Club(name="Legacy Club"), created_at=None),
            Association_CoachClub(club=Club(name="New Club"), created_at=datetime(2026, 9, 1)),
            Association_CoachClub(club=Club(name="Old Club"), created_at=datetime(2026, 1, 1)),
        ]
        assert coach.current_club.name == "New Club"


def test_a_coach_with_no_club_has_no_current_club(app):
    coach_id, _ = _coach_with_clubs(app, [])
    assert _current(app, coach_id) is None


def test_club_scoped_routes_resolve_the_current_club(app, client):
    from flask_jwt_extended import create_access_token

    coach_id, user_id = _coach_with_clubs(
        app, [("Old Club", datetime(2026, 1, 1)), ("New Club", datetime(2026, 9, 1))]
    )
    app.config["JWT_SECRET_KEY"] = "test-jwt-secret"
    with app.app_context():
        token = create_access_token(identity=str(user_id))
    res = client.get("/api/app/coach", headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 200, res.get_json()
    assert res.get_json()["club"]["name"] == "New Club"
