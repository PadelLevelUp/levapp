"""
PAD-272 (audit M8) — the unit-of-work pilot: one transaction per service
operation, opt-in, with the model mixin flushing instead of committing while a
unit of work is open (players.create rule 9 and its criterion "Creating a
player is all or nothing").

Before the pilot, `add_player_service` committed four times (user, player,
coach link, level history), so a foreign-key failure on the level left an
orphan User and Player behind and the request still 500'd.
"""
import pytest

from padel_app.sql_db import db


@pytest.fixture
def coach_id(app):
    from padel_app.models import Coach, User

    with app.app_context():
        user = User(name="Coach", username="p272coach", email="p272@t.test", password="x", status="active")
        db.session.add(user)
        db.session.flush()
        coach = Coach(user_id=user.id, approval_status="approved")
        db.session.add(coach)
        db.session.commit()
        return coach.id


def _payload(coach_id, **overrides):
    payload = {"coachId": coach_id, "name": "Orphan Test", "email": None, "phone": None}
    payload.update(overrides)
    return payload


# ---------------------------------------------------------------------------
# the helper
# ---------------------------------------------------------------------------

def test_outside_a_unit_of_work_create_still_commits(app):
    from padel_app.models import User
    from padel_app.tools.unit_of_work import active

    with app.app_context():
        assert active() is False
        User(name="A", username="p272a", email="a272@t.test", password="x", status="active").create()
        db.session.remove()  # a fresh session sees the row only if it was committed
        assert User.query.filter_by(username="p272a").count() == 1


def test_inside_a_unit_of_work_create_flushes_and_the_block_commits_once(app):
    from padel_app.models import User
    from padel_app.tools.unit_of_work import active, unit_of_work

    with app.app_context():
        with unit_of_work():
            assert active() is True
            u = User(name="B", username="p272b", email="b272@t.test", password="x", status="active")
            u.create()
            assert u.id is not None  # flushed: the id exists inside the block
            with unit_of_work():  # nesting joins the outer unit, it does not commit
                assert active() is True
                User(name="C", username="p272c", email="c272@t.test", password="x", status="active").create()
            assert active() is True
        assert active() is False
        db.session.remove()
        assert User.query.filter(User.username.in_(["p272b", "p272c"])).count() == 2


def test_an_exception_inside_a_unit_of_work_rolls_everything_back(app):
    from padel_app.models import User
    from padel_app.tools.unit_of_work import active, unit_of_work

    with app.app_context():
        with pytest.raises(RuntimeError):
            with unit_of_work():
                User(name="D", username="p272d", email="d272@t.test", password="x", status="active").create()
                User(name="E", username="p272e", email="e272@t.test", password="x", status="active").save()
                raise RuntimeError("boom")
        assert active() is False
        db.session.remove()
        assert User.query.filter(User.username.in_(["p272d", "p272e"])).count() == 0
        # The session is usable again afterwards.
        User(name="F", username="p272f", email="f272@t.test", password="x", status="active").create()
        assert User.query.filter_by(username="p272f").count() == 1


# ---------------------------------------------------------------------------
# the pilot: players.create rule 9
# ---------------------------------------------------------------------------

def test_a_player_whose_level_does_not_exist_leaves_no_rows_behind(app, coach_id):
    from padel_app.models import Player, User
    from padel_app.services.player_service import add_player_service

    with app.app_context():
        users_before = User.query.count()
        players_before = Player.query.count()
        with pytest.raises(Exception):
            add_player_service(_payload(coach_id, levelId=999999))
        db.session.remove()
        assert User.query.count() == users_before
        assert Player.query.count() == players_before
        assert User.query.filter_by(name="Orphan Test").count() == 0


def test_a_valid_player_still_produces_the_four_rows(app, coach_id):
    from padel_app.models import Association_CoachPlayer, CoachLevel, Player, PlayerLevelHistory, User
    from padel_app.services.player_service import add_player_service

    with app.app_context():
        level = CoachLevel(coach_id=coach_id, label="A", code="A", display_order=1)
        db.session.add(level)
        db.session.commit()
        level_id = level.id
        info = add_player_service(_payload(coach_id, name="Kept Player", levelId=level_id))
        db.session.remove()
        user = User.query.filter_by(name="Kept Player").one()
        player = Player.query.filter_by(user_id=user.id).one()
        assert Association_CoachPlayer.query.filter_by(coach_id=coach_id, player_id=player.id).count() == 1
        assert PlayerLevelHistory.query.filter_by(player_id=player.id, level_id=level_id).count() == 1
        assert info is not None
