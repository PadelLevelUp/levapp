"""notifications.invitations NB5 (PAD-918): a new-engine invitation is answered on today's routes,
keyed by its id, and the answer says what happened."""
from datetime import timedelta

import pytest

from padel_app.invitation_engine import effects as fx
from padel_app.sql_db import db
from padel_app.tests.test_pad916_engine_store import NOW, _seed


def _invited(store, session, student):
    """An invitation for the session's open spot: the right side, at the class's ladder level."""
    from padel_app.invitation_engine.snapshot import SpotType

    level = store.snapshot(session).level
    return fx.Invited(session, NOW, student, frozenset({SpotType("R", level)}), None, 2, NOW + timedelta(minutes=20))


def _token(app, user_id):
    from flask_jwt_extended import create_access_token

    app.config["JWT_SECRET_KEY"] = "test-secret"
    with app.app_context():
        return {"Authorization": f"Bearer {create_access_token(identity=str(user_id))}"}


def _user(player_id):
    from padel_app.models.players import Player

    return db.session.get(Player, int(player_id)).user_id


def _invitation(session, student):
    from padel_app.models import EngineInvitation

    return EngineInvitation.query.filter_by(lesson_instance_id=int(session), player_id=int(student)).one().id


@pytest.mark.criterion("NOTIFICATIONS-INVITATIONS-119")
def test_the_answer_route_takes_an_invitation_id_and_says_what_happened(app, client, monkeypatch):
    from padel_app.models.coaches import Coach
    from padel_app.models.notification_config import NotificationConfig
    from padel_app.tests.helpers import pin_clock

    with app.app_context():
        pin_clock(monkeypatch, NOW)
        store, (session,), (regular, first, second, third) = _seed(app, players=4, capacity=2, side="right")
        coach_id = store.coach_of(session)
        db.session.add(NotificationConfig(coach_id=coach_id, auto_notify_enabled=True))
        db.session.commit()
        with store.unit((session,)):
            store.apply([_invited(store, session, s) for s in (first, second, third)])
        ids = {s: _invitation(session, s) for s in (first, second, third)}
        users = {s: _user(s) for s in (first, second, third)}
        coach_user = db.session.get(Coach, coach_id).user_id

    def answer(who, invitation, action="yes", route="respond"):
        return client.post(f"/api/app/notify/{route}", json={"invitationId": invitation, "action": action},
                           headers=_token(app, who))

    yes = answer(users[first], ids[first])                    # the last spot: placed
    assert yes.status_code == 200 and yes.get_json() == {"action": "confirmed", "invitationId": ids[first]}
    assert answer(users[first], ids[first]).get_json() == {
        "action": "confirmed", "invitationId": ids[first], "duplicate": True}

    late = answer(users[second], ids[second])                 # the spot was taken: sorry
    assert late.get_json() == {"action": "sorry", "invitationId": ids[second]}

    assert answer(users[second], 999999).status_code == 404
    assert answer(users[second], ids[third]).status_code == 403   # someone else's invitation

    by_coach = answer(coach_user, ids[third], "no", route="coach_respond")
    assert by_coach.get_json() == {"action": "declined", "invitationId": ids[third]}


@pytest.mark.criterion("NOTIFICATIONS-INVITATIONS-121")
def test_a_yes_to_the_sorrys_offer_joins_the_students_list(app, monkeypatch):
    from padel_app.models.coaches import Coach
    from padel_app.models.notification_config import NotificationConfig
    from padel_app.models.waiting_list_entry import WaitingListEntry
    from padel_app.services.notification_service import (
        _send_system_message,
        add_to_class_waiting_list,
        respond_to_waiting_list,
    )
    from padel_app.tests.helpers import pin_clock

    with app.app_context():
        pin_clock(monkeypatch, NOW)
        store, (session,), (_, sorry, listed) = _seed(app, players=3, capacity=4)
        coach_id = store.coach_of(session)
        db.session.add(NotificationConfig(coach_id=coach_id, auto_notify_enabled=True, waiting_list_side_choice=True))
        db.session.commit()
        from padel_app.models.lesson_instances import LessonInstance
        add_to_class_waiting_list(coach_id, db.session.get(LessonInstance, int(session)), int(listed),
                                  scope="occurrence", side="left")
        coach_user = db.session.get(Coach, coach_id).user_id
        for student in (sorry, listed):                       # the engine's sorry, as its sender writes it
            _send_system_message(coach_user, _user(student), "Sorry", message_type="waiting_list_offer",
                                 msg_metadata={"engine": "new", "lessonInstanceId": int(session)}, push=False)

        assert respond_to_waiting_list(int(session), "yes", _user(sorry), now=NOW) == {
            "action": "added_to_waiting_list"}
        joined = {w.student: (w.list, w.sides) for w in store.snapshot(session).waiting_list}
        assert joined[sorry] == ("students", "own")

        assert respond_to_waiting_list(int(session), "yes", _user(listed), now=NOW) == {
            "action": "added_to_waiting_list", "alreadyWaiting": True}
        assert WaitingListEntry.query.filter_by(lesson_instance_id=int(session), player_id=int(listed)).count() == 1
        assert joined[listed][0] == "coach"


@pytest.mark.criterion("NOTIFICATIONS-INVITATIONS-124")
def test_the_serializer_sends_counts_until_to_the_coach_only(app):
    from padel_app.models.coaches import Coach
    from padel_app.serializers.conversation import serialize_conversation_detail
    from padel_app.serializers.message import serialize_message
    from padel_app.services.notification_service import _send_system_message

    with app.app_context():
        store, (session,), (_, student, _) = _seed(app)
        coach_user = db.session.get(Coach, store.coach_of(session)).user_id
        meta = {"engine": "new", "invitationId": 1, "lessonInstanceId": int(session), "kind": "invite",
                "state": "open", "countsUntil": "2026-11-01T18:20:00"}
        msg = _send_system_message(coach_user, _user(student), "Join?", message_type="notification_invite",
                                   msg_metadata=meta, push=False)

        def counts_until(viewer):
            body = serialize_conversation_detail(msg.conversation, viewer)
            return [m["metadata"].get("countsUntil") for m in body["messages"] if m["id"] == msg.id][0]

        assert counts_until(coach_user) == "2026-11-01T18:20:00"
        assert counts_until(_user(student)) is None
        assert "countsUntil" not in serialize_message(msg, None)["metadata"]       # no viewer: never leaks
        assert serialize_message(msg, None, viewer_id=coach_user)["metadata"]["countsUntil"]


@pytest.mark.criterion("NOTIFICATIONS-INVITATIONS-124")
def test_the_live_event_gives_counts_until_to_the_coach_only(app, monkeypatch):
    from padel_app import realtime
    from padel_app.models.coaches import Coach
    from padel_app.services.notification_service import _send_system_message

    sent = []
    monkeypatch.setattr(realtime, "publish", lambda event, users: sent.append((list(users), event)))
    with app.app_context():
        store, (session,), (_, student, _) = _seed(app)
        coach_user = db.session.get(Coach, store.coach_of(session)).user_id
        meta = {"engine": "new", "invitationId": 1, "lessonInstanceId": int(session), "kind": "invite",
                "state": "open", "countsUntil": "2026-11-01T18:20:00"}
        _send_system_message(coach_user, _user(student), "Join?", message_type="notification_invite",
                             msg_metadata=meta, push=False)
        created = {users[0]: e["payload"]["metadata"] for users, e in sent
                   if e["type"] == "message_created" and len(users) == 1}
        assert created[coach_user]["countsUntil"] == "2026-11-01T18:20:00"
        assert "countsUntil" not in created[_user(student)]
