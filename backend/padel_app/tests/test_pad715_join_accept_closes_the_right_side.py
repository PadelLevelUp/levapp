"""PAD-715 (D7 of PAD-672; classes.join-requests rule 6): accepting a join request closes the open
spot of the accepted student's side — for a "both" student, the one that leaves the class more
balanced — and re-counts the class's other spots as a "yes" does (invitations rule 2d).

The ticket's example: a class of 10 with 4 left and 4 right going has two never-filled spots, one
left and one right. Before PAD-715 the accept closed the OLDEST open spot whatever the student's
side: a right student could close the left spot, the right spot went on inviting right players and
the class ended 4 left / 6 right.
"""
import pytest

from padel_app.sql_db import db
from padel_app.tests.test_effective_level_resolution import _create_class, _create_coach, _create_coach_player, _create_level
from padel_app.tests.test_pad421_balance_structural_sides import _enrol
from padel_app.tests.test_pad581_side_rebalance import _patch_io


def _class_of_ten(tag):
    """4 left + 4 right going; two never-filled spots, one per side (rule 2b)."""
    from padel_app.models.notification_config import NotificationConfig
    from padel_app.services.notification_service import _create_structural_vacancies

    coach = _create_coach(f"p715{tag}")
    level = _create_level(coach, "3", display_order=1)
    db.session.commit()
    _, instance = _create_class(coach, f"p715{tag}", instance_level=level, max_players=10)
    instance.notifications_enabled = True
    for i in range(4):
        _enrol(coach, level, instance, f"p715{tag}-l{i}", "left")
        _enrol(coach, level, instance, f"p715{tag}-r{i}", "right")
    db.session.add(NotificationConfig(coach_id=coach.id, auto_notify_enabled=True))
    db.session.commit()
    spots = sorted(_create_structural_vacancies(instance, coach.id), key=lambda v: v.id)
    db.session.commit()
    assert sorted(v.side for v in spots) == ["left", "right"]
    return coach, level, instance, spots


def _accept(coach, level, instance, username, side):
    from padel_app.models.class_join_request import ClassJoinRequest
    from padel_app.services.class_join_request_service import decide_join_request_service

    cp = _create_coach_player(coach, level, username)
    cp.side = side
    row = ClassJoinRequest(lesson_instance_id=instance.id, player_id=cp.player_id, coach_id=coach.id, status="pending")
    db.session.add(row)
    db.session.commit()
    assert decide_join_request_service(row.id, coach, accept=True, confirm=True).status == "accepted"
    return cp.player_id


def _statuses(spots):
    from padel_app.models.vacancy import Vacancy

    db.session.expire_all()
    return {db.session.get(Vacancy, v.id).side: db.session.get(Vacancy, v.id).status for v in spots}


@pytest.mark.parametrize("which", ["older", "newer"])
def test_a_student_of_either_side_closes_their_own_sides_spot(app, monkeypatch, which):
    """The ticket's 4+4 example. "newer" is red before the fix (the oldest open spot is always the
    wrong one for that student); "older" is the control, right both before and after."""
    _patch_io(monkeypatch)
    with app.app_context():
        coach, level, instance, spots = _class_of_ten(f"b{which[0]}")
        mine = spots[0] if which == "older" else spots[1]
        other = spots[1] if which == "older" else spots[0]
        _accept(coach, level, instance, f"p715b{which[0]}-new", mine.side)
        assert _statuses(spots) == {mine.side: "filled", other.side: "open"}


def test_a_both_sided_student_closes_the_spot_that_leaves_the_class_balanced(app, monkeypatch):
    """One going player of the OLDER spot's side is re-sided to the newer spot's side after the spots
    were made: 3 of the older side, 5 of the newer, open spots still one of each. A "both" student
    takes a place; leaving the older side's spot open gives 4 / 5, leaving the other gives 3 / 6 —
    so the NEWER spot closes (never "the oldest" by luck)."""
    from padel_app.models.Association_CoachPlayer import Association_CoachPlayer

    _patch_io(monkeypatch)
    with app.app_context():
        coach, level, instance, (older, newer) = _class_of_ten("c")
        resided = (Association_CoachPlayer.query.filter_by(coach_id=coach.id, side=older.side)
                   .order_by(Association_CoachPlayer.id).first())
        assert resided.player_id in {p.player_id for p in instance.holding_presences}  # one of the 8 going
        resided.side = newer.side
        db.session.commit()
        _accept(coach, level, instance, "p715c-both", "both")
        assert _statuses([older, newer]) == {newer.side: "filled", older.side: "open"}


def test_the_accept_re_counts_the_other_spots(app, monkeypatch):
    """Rule 2d after a join-request accept, as after a "yes": 4 left + 4 right going and two LEFT
    spots open (the second set left by hand). A left student takes the first; counted as going
    (5 left / 4 right) the remaining spot re-counts to RIGHT. Without the re-count it stays left."""
    _patch_io(monkeypatch)
    with app.app_context():
        coach, level, instance, (older, newer) = _class_of_ten("d")
        for v in (older, newer):
            v.side = "left"
        db.session.commit()
        _accept(coach, level, instance, "p715d-new", "left")
        from padel_app.models.vacancy import Vacancy

        db.session.expire_all()
        closed, kept = db.session.get(Vacancy, older.id), db.session.get(Vacancy, newer.id)
        assert (closed.status, kept.status, kept.side) == ("filled", "open", "right")


def test_a_sided_student_with_no_spot_of_their_side_takes_a_side_less_one(app, monkeypatch):
    _patch_io(monkeypatch)
    with app.app_context():
        coach, level, instance, (older, newer) = _class_of_ten("e")
        older.side, newer.side = "right", None
        db.session.commit()
        _accept(coach, level, instance, "p715e-new", "left")
        from padel_app.models.vacancy import Vacancy

        db.session.expire_all()
        assert (db.session.get(Vacancy, older.id).status, db.session.get(Vacancy, newer.id).status) == ("open", "filled")


def test_a_sided_student_with_only_other_side_spots_takes_the_oldest(app, monkeypatch):
    _patch_io(monkeypatch)
    with app.app_context():
        coach, level, instance, (older, newer) = _class_of_ten("f")
        older.side = newer.side = "right"
        db.session.commit()
        _accept(coach, level, instance, "p715f-new", "left")
        from padel_app.models.vacancy import Vacancy

        db.session.expire_all()
        assert (db.session.get(Vacancy, older.id).status, db.session.get(Vacancy, newer.id).status) == ("filled", "open")
