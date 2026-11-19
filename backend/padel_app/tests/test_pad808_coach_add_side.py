"""PAD-808 (engine-store rule 9, engine-answers rule 10): a coach's accept, add or per-session side reaches the
new engine with its side, so the engine counts the student on it, and a side the coach chose is firm. Before,
CoachAdded wrote no placement: a student the coach added counted on neither side, so the left side looked
open after it filled.
"""
import pytest

from padel_app.models.Association_CoachPlayer import Association_CoachPlayer as CoachPlayer
from padel_app.sql_db import db
from padel_app.tests.test_pad581_side_rebalance import _patch_io
from padel_app.tests.test_pad808_accept_warns_when_the_side_is_gone import _new_engine_class, _request


def _placement(instance, player_id):
    """The presence's (assigned_side, side) and the engine's placement of the student, as the store hands it."""
    from padel_app.models import Presence
    from padel_app.services.engine_store import TableStore

    db.session.expire_all()
    presence = Presence.query.filter_by(player_id=player_id, lesson_instance_id=instance.id).one()
    placed = TableStore().snapshot(str(instance.id)).placement(str(player_id))
    return (presence.assigned_side, presence.side), (placed.side, placed.firm) if placed else None


def _spot_types(instance):
    from padel_app.invitation_engine import planner
    from padel_app.services.engine_store import TableStore, settings_for

    snap = TableStore().snapshot(str(instance.id))
    counts = planner.spot_counts(snap, settings_for(str(instance.id)))
    return [(t.side, n) for t, n in planner.spot_types(snap, counts)]


def _flexible(coach, player_id):
    CoachPlayer.query.filter_by(coach_id=coach.id, player_id=player_id).one().side = "both"
    db.session.commit()


def _class_edit_add(instance, player_id):
    from padel_app.services.lesson_service import edit_class_service

    day = instance.start_datetime.strftime("%Y-%m-%d")
    result, status = edit_class_service({"event": {"model": "LessonInstance", "originalId": instance.id, "date": day},
                                         "scope": "single", "updates": {"addPlayers": [player_id]}})
    assert status == 200, result


@pytest.mark.criterion("NOTIFICATIONS-ENGINE-STORE-11")
def test_a_coachs_accept_or_add_reaches_the_engine_with_its_side(app, monkeypatch):
    from padel_app.models import Presence
    from padel_app.services.class_join_request_service import decide_join_request_service
    from padel_app.services.engine_entry import student_not_going
    from padel_app.services.engine_store import TableStore
    from padel_app.services.engine_switch import _adopt
    from padel_app.services.presence_side_service import set_presence_side
    from padel_app.tests.test_effective_level_resolution import _create_coach_player
    from padel_app.tests.test_pad715_join_accept_closes_the_right_side import _class_of_ten
    from padel_app.utils.dates import utcnow_naive

    _patch_io(monkeypatch)
    with app.app_context():
        # An accept: a {left, right} student asks left, of a class with 4 left and 4 right going.
        coach, level, instance = _new_engine_class("cas1", lefts=4)
        rid, flexible = _request(coach, level, instance, "pcas1-flex", "left")
        _flexible(coach, flexible)
        assert decide_join_request_service(rid, coach, accept=True, confirm=True).status == "accepted"
        assert _placement(instance, flexible) == (("left", "left"), ("L", True))
        assert _spot_types(instance) == [("R", 1)]                             # one right `must`, nothing else

        # A `both` request passes no side: the student stays unplaced.
        coach, level, instance = _new_engine_class("cas3", lefts=4)
        rid, both = _request(coach, level, instance, "pcas3-both", "both")
        assert decide_join_request_service(rid, coach, accept=True, confirm=True).status == "accepted"
        assert _placement(instance, both)[1] == (None, False)

        # A re-add: the coach added a {left, right} student and set their side for the session to right
        # while the class was on the old engine; the new engine adopts it, the student cancels, the coach
        # adds them again through the class edit.
        coach, level, instance, _ = _class_of_ten("cas2")
        cp = _create_coach_player(coach, level, "pcas2-added")
        cp.side = "both"
        db.session.commit()
        _class_edit_add(instance, cp.player_id)
        set_presence_side(coach, instance, cp.player_id, "right")
        assert _adopt(TableStore(clock=utcnow_naive), instance, coach.id, utcnow_naive())
        db.session.commit()
        presence = Presence.query.filter_by(player_id=cp.player_id, lesson_instance_id=instance.id).one()
        student_not_going(instance, presence)
        assert _placement(instance, cp.player_id)[1] is None                  # not going
        _class_edit_add(instance, cp.player_id)
        assert _placement(instance, cp.player_id) == (("right", "right"), ("R", True))


@pytest.mark.criterion("NOTIFICATIONS-ENGINE-STORE-12")
def test_the_coachs_session_side_and_an_old_yes_reach_the_engine(app, monkeypatch):
    from padel_app.models import Message, NotificationEvent
    from padel_app.models.coaches import Coach
    from padel_app.models.lesson_instances import LessonInstance
    from padel_app.models.players import Player
    from padel_app.models.vacancy import Vacancy
    from padel_app.services import notification_service as ns
    from padel_app.services.class_join_request_service import decide_join_request_service
    from padel_app.services.presence_side_service import set_presence_side
    from padel_app.tests.helpers import pin_clock
    from padel_app.tests.test_pad916_engine_store import NOW, _seed

    _patch_io(monkeypatch)
    with app.app_context():
        # The coach's per-session side (PAD-551) on a placed {left, right} student: the engine's, firm, and
        # neither the old engine's re-count nor a message.
        coach, level, instance = _new_engine_class("cas4", lefts=4)
        rid, flexible = _request(coach, level, instance, "pcas4-flex", "left")
        _flexible(coach, flexible)
        assert decide_join_request_service(rid, coach, accept=True, confirm=True).status == "accepted"
        recounts = []
        monkeypatch.setattr(ns, "rebalance_after_side_change", lambda *a, **kw: recounts.append(a) or [])
        before = Message.query.count()
        set_presence_side(coach, instance, flexible, "right")
        assert _placement(instance, flexible) == (("right", "right"), ("R", True))
        # Nothing to the student: the only new message is the coach's alert from the re-plan (the left
        # spot the move opened has nobody left to ask, engine-planning rule 11).
        new = [m.message_type for m in Message.query.order_by(Message.id).all()[before:]]
        assert (recounts, new) == ([], ["engine_alert"])

    with app.app_context():
        # NM3: a {left, right} student says Yes to an old-engine invitation for a right vacancy of a session
        # now on the new engine: placed right, not firm. The clock as NOTIFICATIONS-MANUAL-15's test pins it.
        pin_clock(monkeypatch, NOW)
        store, (s,), (_, student) = _seed(app, players=2, side="both", capacity=4)
        coach_id = store.coach_of(s)
        vacancy = Vacancy(lesson_instance_id=int(s), coach_id=coach_id, status="open", side="right")
        db.session.add(vacancy)
        db.session.flush()
        event = NotificationEvent(coach_id=coach_id, lesson_instance_id=int(s), player_id=int(student),
                                  vacancy_id=vacancy.id, type="manual", round_number=1, status="sent")
        db.session.add(event)
        db.session.flush()
        user_id = db.session.get(Player, int(student)).user_id
        msg = ns._send_system_message(db.session.get(Coach, coach_id).user_id, user_id, "Vens?",
                                      message_type="notification_invite", push=False,
                                      msg_metadata={"notificationEventId": event.id, "lessonInstanceId": int(s),
                                                    "responded": False})
        event.message_id = msg.id
        db.session.commit()
        ns.respond_to_notification(event.id, "yes", user_id)
        assert _placement(db.session.get(LessonInstance, int(s)), int(student)) == (("right", None), ("R", False))


@pytest.mark.criterion("NOTIFICATIONS-ENGINE-STORE-13")
def test_a_failed_engine_call_on_the_coachs_side_heals_on_the_next_unit(app, monkeypatch):
    """engine-store rule 9: the coach's per-session side stands when the engine's call raises (the request
    still succeeds), and the session's next unit writes it as the assigned side, firm."""
    from padel_app.services import engine_entry
    from padel_app.services.class_join_request_service import decide_join_request_service
    from padel_app.services.presence_side_service import set_presence_side

    _patch_io(monkeypatch)
    with app.app_context():
        coach, level, instance = _new_engine_class("cas5", lefts=4)
        rid, flexible = _request(coach, level, instance, "pcas5-flex", "left")
        _flexible(coach, flexible)
        assert decide_join_request_service(rid, coach, accept=True, confirm=True).status == "accepted"

        real = engine_entry.handle

        def failing(*a, **kw):
            raise RuntimeError("engine down")

        monkeypatch.setattr(engine_entry, "handle", failing)
        assert set_presence_side(coach, instance, flexible, "right").side == "right"
        db.session.rollback()
        assert _placement(instance, flexible)[0] == ("left", "right")       # the engine's side is behind
        monkeypatch.setattr(engine_entry, "handle", real)
        engine_entry.replan([instance.id])                                   # the session's next unit
        assert _placement(instance, flexible) == (("right", "right"), ("R", True))


@pytest.mark.criterion("NOTIFICATIONS-ENGINE-STORE-14")
def test_an_engine_placement_on_another_side_clears_a_stale_session_side(app, monkeypatch):
    """engine-store rule 9: a presence's per-session side left from an earlier stay (an accepted left request,
    then a cancel) does not override the engine's own placement on the right: the placement clears it."""
    from padel_app.invitation_engine import requests as rq
    from padel_app.models import Presence
    from padel_app.services import engine_entry
    from padel_app.services.class_join_request_service import decide_join_request_service

    _patch_io(monkeypatch)
    with app.app_context():
        coach, level, instance = _new_engine_class("cas6", lefts=4)
        rid, flexible = _request(coach, level, instance, "pcas6-flex", "left")
        _flexible(coach, flexible)
        assert decide_join_request_service(rid, coach, accept=True, confirm=True).status == "accepted"
        presence = Presence.query.filter_by(player_id=flexible, lesson_instance_id=instance.id).one()
        engine_entry.student_not_going(instance, presence)
        from padel_app.models.notification_config import NotificationConfig

        NotificationConfig.query.filter_by(coach_id=coach.id).one().auto_accept_join_requests = True   # direct join
        db.session.commit()
        effects = engine_entry.handle(instance, rq.DirectJoin(str(flexible), "R"))   # the engine places them right
        assert [e.side for e in effects if type(e).__name__ == "Placed"] == ["R"]
        engine_entry.replan([instance.id])                                   # a later unit
        assert _placement(instance, flexible) == (("right", None), ("R", False))
