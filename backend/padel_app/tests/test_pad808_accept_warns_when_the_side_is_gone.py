"""PAD-808 (B-719; classes.join-requests rules 7 and 20): a coach accepting, by hand, a join request
whose side has no open spot any more is warned, as for eligibility, and the accept waits for their
confirm. Both warnings come in the one 409, under the existing code "ineligible" (old clients keep
showing their warning), with `requestedSide`, `openSides` and a `reasons` list naming each part.

Before the fix the accept went straight through: a left student took the right spot and was
recorded as playing left, and the coach was never asked.
"""
from werkzeug.exceptions import HTTPException

import pytest

from padel_app.sql_db import db
from padel_app.tests.test_effective_level_resolution import _create_coach_player
from padel_app.tests.test_pad581_side_rebalance import _patch_io
from padel_app.tests.test_pad715_join_accept_closes_the_right_side import _class_of_ten


def _request(coach, level, instance, username, side):
    from padel_app.models.class_join_request import ClassJoinRequest

    cp = _create_coach_player(coach, level, username)
    cp.side = side
    row = ClassJoinRequest(lesson_instance_id=instance.id, player_id=cp.player_id, coach_id=coach.id,
                           status="pending", side=side)
    db.session.add(row)
    db.session.commit()
    return row.id, cp.player_id


def _both_spots(spots, side):
    for v in spots:
        v.side = side
    db.session.commit()


def _state(instance, spots, player_id):
    from padel_app.models import LessonInstance, Presence
    from padel_app.models.vacancy import Vacancy

    db.session.expire_all()
    presence = Presence.query.filter_by(player_id=player_id, lesson_instance_id=instance.id).first()
    return (
        player_id in db.session.get(LessonInstance, instance.id).enrolled_player_ids,
        sorted(db.session.get(Vacancy, v.id).status for v in spots),
        presence.side if presence is not None else None,
    )


@pytest.mark.criterion("CLASSES-JOIN-REQUESTS-9")
def test_accepting_a_left_request_with_only_right_spots_open_warns_and_enrols_nobody(app, monkeypatch):
    """RED before the fix: the accept returned "accepted" with no warning."""
    from padel_app.services.class_join_request_service import decide_join_request_service

    _patch_io(monkeypatch)
    with app.app_context():
        coach, level, instance, spots = _class_of_ten("808a")
        _both_spots(spots, "right")
        rid, pid = _request(coach, level, instance, "p808a-new", "left")
        with pytest.raises(HTTPException) as e:
            decide_join_request_service(rid, coach, accept=True, confirm=False)
        body = e.value.response.get_json()
        assert body["code"] == "ineligible"
        assert (body["requestedSide"], body["openSides"]) == ("left", ["right"])
        assert "side" in body["reasons"]
        assert _state(instance, spots, pid) == (False, ["open", "open"], None)


@pytest.mark.criterion("CLASSES-JOIN-REQUESTS-9")
def test_confirming_enrols_the_student_on_a_right_spot_playing_left(app, monkeypatch):
    """The coach's confirm is the override (rule 7): the oldest open spot closes, presence side left."""
    from padel_app.services.class_join_request_service import decide_join_request_service

    _patch_io(monkeypatch)
    with app.app_context():
        coach, level, instance, spots = _class_of_ten("808b")
        _both_spots(spots, "right")
        rid, pid = _request(coach, level, instance, "p808b-new", "left")
        assert decide_join_request_service(rid, coach, accept=True, confirm=True).status == "accepted"
        assert _state(instance, spots, pid) == (True, ["filled", "open"], "left")


@pytest.mark.criterion("CLASSES-JOIN-REQUESTS-9")
def test_with_a_spot_of_the_requested_side_open_the_accept_needs_no_confirm(app, monkeypatch):
    """Control: green before and after."""
    from padel_app.services.class_join_request_service import decide_join_request_service

    _patch_io(monkeypatch)
    with app.app_context():
        coach, level, instance, spots = _class_of_ten("808c")
        rid, pid = _request(coach, level, instance, "p808c-new", "left")
        assert decide_join_request_service(rid, coach, accept=True, confirm=False).status == "accepted"
        assert _state(instance, spots, pid) == (True, ["filled", "open"], "left")


@pytest.mark.criterion("CLASSES-JOIN-REQUESTS-9")
def test_a_both_request_never_gets_the_side_warning(app, monkeypatch):
    """Control: a "both" student can take any spot (rule 20)."""
    from padel_app.services.class_join_request_service import decide_join_request_service

    _patch_io(monkeypatch)
    with app.app_context():
        coach, level, instance, spots = _class_of_ten("808d")
        _both_spots(spots, "right")
        rid, pid = _request(coach, level, instance, "p808d-new", "both")
        assert decide_join_request_service(rid, coach, accept=True, confirm=False).status == "accepted"


@pytest.mark.criterion("CLASSES-JOIN-REQUESTS-10")
def test_a_student_failing_the_bar_and_the_side_gets_one_warning_with_both(app, monkeypatch):
    """Both parts in the one 409; the confirm then enrols. The bar's failure is stubbed: what is under
    test is the merge, not the bar (rule 7 has its own tests)."""
    from padel_app.services import notification_service as ns
    from padel_app.services.class_join_request_service import decide_join_request_service

    _patch_io(monkeypatch)
    with app.app_context():
        coach, level, instance, spots = _class_of_ten("808e")
        _both_spots(spots, "right")
        rid, pid = _request(coach, level, instance, "p808e-new", "left")
        failing = [{"playerId": pid, "name": "x", "failures": [{"code": "absences"}]}]
        monkeypatch.setattr(ns, "eligibility_failures_for_players", lambda *a, **kw: failing)
        with pytest.raises(HTTPException) as e:
            decide_join_request_service(rid, coach, accept=True, confirm=False)
        body = e.value.response.get_json()
        assert (body["code"], body["reasons"], body["ineligible"]) == ("ineligible", ["eligibility", "side"], failing)
        assert (body["requestedSide"], body["openSides"]) == ("left", ["right"])
        assert decide_join_request_service(rid, coach, accept=True, confirm=True).status == "accepted"
        assert _state(instance, spots, pid) == (True, ["filled", "open"], "left")


def test_a_side_only_warning_carries_an_empty_ineligible_list(app, monkeypatch):
    """Old clients branch on code "ineligible" and read `ineligible`: it is there, empty."""
    from padel_app.services.class_join_request_service import decide_join_request_service

    _patch_io(monkeypatch)
    with app.app_context():
        coach, level, instance, spots = _class_of_ten("808f")
        _both_spots(spots, "right")
        rid, _ = _request(coach, level, instance, "p808f-new", "left")
        with pytest.raises(HTTPException) as e:
            decide_join_request_service(rid, coach, accept=True, confirm=False)
        body = e.value.response.get_json()
        assert (body["ineligible"], body["reasons"]) == ([], ["side"])


def _new_engine_class(tag, lefts):
    """`_class_of_ten` adopted by the new engine as the switch does it (its regulars placed on their
    side, its unstarted vacancies closed): `lefts` left and 4 right going, no open vacancy row (D1)."""
    from padel_app.models.vacancy import Vacancy
    from padel_app.services.engine_store import TableStore
    from padel_app.services.engine_switch import _adopt
    from padel_app.tests.test_pad421_balance_structural_sides import _enrol
    from padel_app.utils.dates import utcnow_naive

    coach, level, instance, _ = _class_of_ten(tag)
    for i in range(4, lefts):
        _enrol(coach, level, instance, f"p715{tag}-l{i}", "left")
    db.session.commit()
    assert _adopt(TableStore(clock=utcnow_naive), instance, coach.id, utcnow_naive())
    db.session.commit()
    assert Vacancy.query.filter_by(lesson_instance_id=instance.id, status="open").count() == 0
    return coach, level, instance


@pytest.mark.criterion("CLASSES-JOIN-REQUESTS-39")
def test_a_new_engine_class_warns_from_the_engines_spots(app, monkeypatch):
    """join-requests NJ3: no vacancy row on the new engine, so the side is read from the engine's open
    spot types. RED before the fix: the accept went through with no warning."""
    from padel_app.models import LessonInstance, Presence
    from padel_app.services.class_join_request_service import decide_join_request_service
    from padel_app.services.engine_switch import engine_for

    _patch_io(monkeypatch)
    with app.app_context():
        coach, level, instance = _new_engine_class("808g", lefts=5)       # one right spot, no left one
        assert engine_for(instance) == "new"
        rid, pid = _request(coach, level, instance, "p808g-new", "left")
        with pytest.raises(HTTPException) as e:
            decide_join_request_service(rid, coach, accept=True, confirm=False)
        body = e.value.response.get_json()
        assert (body["code"], body["reasons"]) == ("ineligible", ["side"])
        assert (body["requestedSide"], body["openSides"]) == ("left", ["right"])
        db.session.expire_all()
        assert pid not in db.session.get(LessonInstance, instance.id).enrolled_player_ids

        assert decide_join_request_service(rid, coach, accept=True, confirm=True).status == "accepted"
        db.session.expire_all()
        presence = Presence.query.filter_by(player_id=pid, lesson_instance_id=instance.id).first()
        assert pid in db.session.get(LessonInstance, instance.id).enrolled_player_ids
        assert presence.side == "left"

        coach, level, instance = _new_engine_class("808h", lefts=4)       # a left spot open
        rid, _ = _request(coach, level, instance, "p808h-new", "left")
        assert decide_join_request_service(rid, coach, accept=True, confirm=False).status == "accepted"
