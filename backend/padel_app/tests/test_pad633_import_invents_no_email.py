"""PAD-633 (import.confirm rules 5-8): a spreadsheet Players row without an email creates a
player without an email and with a `pending-…` placeholder username, as the add-player form
does. Before, the import invented `first_second@email.com` (a real public mail domain) and derived
the username from it (PAD-105: a coach never sets a username).

The data migration that removes the invented addresses from existing rows is proven in
test_pad633_migration.py.
"""
from sqlalchemy import func

from padel_app.sql_db import db


def _coach(app, username):
    from padel_app.models import User
    from padel_app.models.coaches import Coach

    with app.app_context():
        user = User(name=username.title(), username=username, password="x", status="active")
        db.session.add(user)
        db.session.flush()
        coach = Coach(user_id=user.id)
        db.session.add(coach)
        db.session.commit()
        return coach.id


def _import(app, coach_id, rows):
    from padel_app.models.coaches import Coach
    from padel_app.services.import_service import bulk_create_players

    with app.app_context():
        return bulk_create_players(rows, db.session.get(Coach, coach_id), None)


def _roster(app, coach_id):
    """(name, email, username) of every user on the coach's roster."""
    from padel_app.models import Association_CoachPlayer, Player, User

    with app.app_context():
        rows = (
            db.session.query(User.name, User.email, User.username)
            .join(Player, Player.user_id == User.id)
            .join(Association_CoachPlayer, Association_CoachPlayer.player_id == Player.id)
            .filter(Association_CoachPlayer.coach_id == coach_id)
            .order_by(User.id)
            .all()
        )
        return [tuple(r) for r in rows]


def _invented_addresses(app):
    from padel_app.models import User

    with app.app_context():
        return User.query.filter(func.lower(User.email).like("%@email.com")).count()


def test_a_row_without_an_email_stores_no_email_and_a_placeholder_username(app):
    coach = _coach(app, "coach-a")
    result = _import(app, coach, [{"name": "João Silva"}, {"name": "Rita"}])
    assert (result["imported"], result["errors"]) == (2, [])
    roster = _roster(app, coach)
    assert [(name, email) for name, email, _ in roster] == [("João Silva", None), ("Rita", None)]
    assert all(username.startswith("pending-") for _, _, username in roster)
    assert _invented_addresses(app) == 0


def test_a_row_without_an_email_never_joins_another_coachs_player(app):
    coach_a = _coach(app, "coach-a")
    coach_b = _coach(app, "coach-b")
    _import(app, coach_a, [{"name": "João Silva"}])
    _import(app, coach_b, [{"name": "João Silva"}])
    (a_player,) = _roster(app, coach_a)
    (b_player,) = _roster(app, coach_b)
    assert a_player[2] != b_player[2], "coach B got a person of their own, not coach A's"


def test_two_rows_with_the_same_name_and_no_email_are_two_players(app):
    coach = _coach(app, "coach-a")
    result = _import(app, coach, [{"name": "Ana Costa"}, {"name": "Ana Costa"}])
    assert (result["imported"], result["errors"]) == (2, [])
    assert len(_roster(app, coach)) == 2


def test_a_row_with_an_email_reuses_that_account_case_insensitively(app):
    from padel_app.models import User

    coach_a = _coach(app, "coach-a")
    coach_b = _coach(app, "coach-b")
    _import(app, coach_a, [{"name": "Ana", "email": "ana@example.com"}])
    result = _import(app, coach_b, [{"name": "Ana", "email": "ANA@example.com"}])
    assert (result["imported"], result["errors"]) == (1, [])
    with app.app_context():
        assert User.query.filter(func.lower(User.email) == "ana@example.com").count() == 1
    assert _roster(app, coach_a)[0][2] == _roster(app, coach_b)[0][2]

    again = _import(app, coach_b, [{"name": "Ana", "email": "ana@example.com"}])
    assert again["imported"] == 0, "the coach link already exists: a re-import is a no-op"
    assert len(_roster(app, coach_b)) == 1


def test_a_new_user_with_an_email_also_gets_a_placeholder_username(app):
    coach = _coach(app, "coach-a")
    _import(app, coach, [{"name": "Ana", "email": "ana.silva@example.com"}])
    ((_, email, username),) = _roster(app, coach)
    assert email == "ana.silva@example.com"
    assert username.startswith("pending-"), "the import never derives a username from the email"
