"""attendance.confirm rule 32: on a new-engine class "Afinal vou" (``comeBack`` ``rejoin``) is offered only
when the engine would place the student now (engine-answers rule 16): room in the class and on a side they
play, an open invitation holding no place, never while they are going elsewhere at that hour. The class
payload, the dashboard row and the reminder message carry the one value; the tap agrees with it.
"""
from datetime import timedelta

import pytest

from padel_app.invitation_engine import effects as fx
from padel_app.sql_db import db
from padel_app.tests.test_pad916_engine_store import NOW, START

AT = NOW + timedelta(minutes=5)
LATER = AT + timedelta(minutes=30)


def _set_side(coach_id, student, side):
    from padel_app.models.Association_CoachPlayer import Association_CoachPlayer

    Association_CoachPlayer.query.filter_by(coach_id=coach_id, player_id=int(student)).one().side = side


def _presence(session, student):
    from padel_app.models.presences import Presence

    return Presence.query.filter_by(lesson_instance_id=int(session), player_id=int(student)).one()


def _instance(session):
    from padel_app.models.lesson_instances import LessonInstance

    return db.session.get(LessonInstance, int(session))


def _user(student):
    from padel_app.models.players import Player

    return db.session.get(Player, int(student)).user_id


def _reminder(coach_user, student, session, message_type="notification_reminder"):
    """The reminder message the student was sent for the class, in their conversation with the coach."""
    from padel_app.models import Message
    from padel_app.services.notification_service import _get_or_create_direct_conversation

    conv = _get_or_create_direct_conversation(coach_user, _user(student))
    msg = Message(text="Vens?", sender_id=coach_user, conversation_id=conv.id, message_type=message_type,
                  msg_metadata={"lessonInstanceId": int(session)})
    db.session.add(msg)
    db.session.commit()
    return msg


@pytest.mark.criterion("ATTENDANCE-CONFIRM-45")
def test_come_back_offers_rejoin_only_when_the_engine_would_place_the_student(app, monkeypatch):
    from padel_app.helpers.dashboard.confirmation import ask_state
    from padel_app.invitation_engine.answers import return_sides
    from padel_app.models.coaches import Coach
    from padel_app.models.notification_config import NotificationConfig
    from padel_app.models.waiting_list_entry import WaitingListEntry
    from padel_app.serializers.lesson import serialize_class_instance
    from padel_app.serializers.message import serialize_message
    from padel_app.services.engine_entry import answer_attendance_request
    from padel_app.tests.helpers import pin_clock
    from padel_app.tests.test_pad916_engine_store import _invited, _seed
    from padel_app.utils import expo_push, push_notifications
    from padel_app.utils.dates import utc_to_wall_naive

    import padel_app.services.engine_entry  # noqa: F401 — loaded before the pin

    monkeypatch.setattr(push_notifications, "send_push_notification", lambda **kw: None)
    monkeypatch.setattr(expo_push, "send_expo_push_to_user", lambda *a, **k: None)
    with app.app_context():
        pin_clock(monkeypatch, NOW)
        # A class of 4 (two a side) and another of the coach's classes at the same hour.
        store, (a, b), pids = _seed(app, starts=(START, START), players=9, capacity=4, side="left")
        regular, x, y, z, w, r1, r2, bia, eve = pids
        coach_id = store.coach_of(a)
        coach_user = db.session.get(Coach, coach_id).user_id
        for s in (y, r1, r2):
            _set_side(coach_id, s, "right")
        db.session.add(NotificationConfig(coach_id=coach_id, auto_notify_enabled=True, engine_version="new",
                                          engine_switched_at=NOW - timedelta(days=1)))
        db.session.commit()

        with store.unit((a,)):
            store.apply([fx.Placed(a, NOW, x, "L", "invitation"), fx.Placed(a, NOW, y, "R", "invitation"),
                         fx.Placed(a, NOW, z, "L", "invitation"), fx.Placed(a, NOW, r1, "R", "invitation")])
        with store.unit((a,)):
            store.apply([_invited(a, bia)])                    # an open invitation offering the left
        for s in (regular, x, y, z):                           # the regular's No; three cancellations
            answer_attendance_request(_instance(a), _presence(a, s), "no", AT)
        answer_attendance_request(_instance(b), _presence(b, regular), "no", AT)   # not going to b either
        with store.unit((a,)):
            store.apply([fx.Placed(a, AT, w, "L", "invitation"), fx.Placed(a, AT, r2, "R", "invitation")])
        with store.unit((b,)):
            store.apply([fx.Placed(b, AT, z, "L", "invitation")])   # z now goes to b, at the same hour
        db.session.expire_all()
        snap = store.snapshot(a)
        assert {p.student for p in snap.going} == {w, r1, r2}  # three going: two right, one left

        pin_clock(monkeypatch, LATER)

        def come_back(student):
            """The class payload, the dashboard row and the reminder message, which must agree."""
            payload = serialize_class_instance(_instance(a), viewer_player_id=int(student))["comeBack"]
            row = ask_state(int(student), [int(a)], utc_to_wall_naive(LATER))[int(a)]["comeBack"]
            msg = serialize_message(_reminder(coach_user, student, a), None, viewer_id=_user(student))["comeBack"]
            assert payload == row == msg, (student, payload, row, msg)
            return payload

        expected = {regular: "rejoin", x: "rejoin", y: "waiting_list", z: "waiting_list"}
        assert {s: come_back(s) for s in expected} == expected
        snap = store.snapshot(a)                               # one predicate: the light read is the full one's
        assert {s: bool(return_sides(snap, s)) for s in expected} == {s: v == "rejoin" for s, v in expected.items()}

        # The regular going to b again, at the same hour: no "rejoin", in the light read and the full one.
        with store.unit((b,)):
            store.apply([fx.Placed(b, AT, regular, "L", "regular_returns")])
        db.session.expire_all()
        assert come_back(regular) == "waiting_list"
        assert not return_sides(store.snapshot(a), regular)
        answer_attendance_request(_instance(b), _presence(b, regular), "no", LATER)   # and says No to b again
        db.session.expire_all()
        assert come_back(regular) == "rejoin"

        # A coach viewer, and another message type, get null.
        assert serialize_message(_reminder(coach_user, x, a), None, viewer_id=coach_user)["comeBack"] is None
        assert serialize_message(_reminder(coach_user, x, a, "text"), None, viewer_id=_user(x))["comeBack"] is None
        assert serialize_class_instance(_instance(a))["comeBack"] is None

        # The tap agrees: the right-only student gets spot_filled; the left place goes to x.
        assert answer_attendance_request(_instance(a), _presence(a, y), "yes", LATER) == {"action": "spot_filled"}
        assert answer_attendance_request(_instance(a), _presence(a, x), "yes", LATER) == {"action": "confirmed"}
        # Once a left student is placed, the left-only ones read waiting_list, or on_waiting_list.
        assert come_back(regular) == "waiting_list"
        db.session.add(WaitingListEntry(lesson_instance_id=int(a), player_id=int(regular), coach_id=coach_id,
                                        is_active=True, added_by="student", joined_at=LATER))
        db.session.commit()
        assert come_back(regular) == "on_waiting_list"

        # An old-engine class: the class-wide count, unchanged (its right side full, the class not).
        from padel_app.models import EngineSession
        from padel_app.services.lesson_service import enrol

        old = _instance(b)
        db.session.delete(db.session.get(EngineSession, old.id))
        db.session.commit()
        for s in (r1, r2):
            enrol(int(s), old, "fill", new_engine=True)
        enrol(int(y), old, "fill", new_engine=True).status = "absent"
        db.session.commit()
        assert serialize_class_instance(_instance(b), viewer_player_id=int(y))["comeBack"] == "rejoin"
