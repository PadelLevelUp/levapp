"""notifications.invitations NB6: the old-client shim. App Store builds 33-35 answer an invitation only by
``notificationEventId``, hide its buttons only on ``metadata.responded``, and on iOS answer and withdraw a
class detail invitee row by its ``id``. A new-engine invitation speaks their language: its id is
``-invitationId`` on the bubble, the Home card item and the class detail row; every closing state writes
``responded`` and a ``response``; the answer and withdrawal routes take the negative id.
"""
from datetime import timedelta

import pytest

from padel_app.sql_db import db
from padel_app.tests.test_pad916_engine_store import NOW, START, _seed
from padel_app.tests.test_pad918_engine_respond import _invitation, _invited, _token, _user


def _world(app, monkeypatch, players=4, capacity=2):
    """A new-engine session with the coach's automatic invitations on, and one sent invitation (bubble
    included) per student after the regular: (store, session, students, invitation ids, student users,
    coach user)."""
    from padel_app.models.coaches import Coach
    from padel_app.models.notification_config import NotificationConfig
    from padel_app.services.engine_runner import send_outbox
    from padel_app.tests.helpers import pin_clock

    pin_clock(monkeypatch, NOW)
    store, (session,), (_, *students) = _seed(app, players=players, capacity=capacity, side="right")
    coach_id = store.coach_of(session)
    db.session.add(NotificationConfig(coach_id=coach_id, auto_notify_enabled=True))
    db.session.commit()
    with store.unit((session,)):
        store.apply([_invited(store, session, s) for s in students])
    send_outbox()
    ids = {s: _invitation(session, s) for s in students}
    users = {s: _user(s) for s in students}
    return store, session, students, ids, users, db.session.get(Coach, coach_id).user_id


def _bubble(invitation_id):
    """The invitation's newest bubble's metadata, as stored."""
    from padel_app.models import EngineInvitation, Message

    db.session.expire_all()
    row = db.session.get(EngineInvitation, invitation_id)
    return dict(db.session.get(Message, list(row.message_ids)[-1]).msg_metadata)


def _closed(meta):
    return (meta.get("state"), meta.get("responded"), meta.get("response"))


@pytest.mark.criterion("NOTIFICATIONS-INVITATIONS-129")
def test_a_new_engine_bubble_carries_the_old_id_and_closes_for_old_builds(app, client, monkeypatch):
    from padel_app.models import EngineInvitation
    from padel_app.services.engine_store import _refresh_bubbles

    with app.app_context():
        store, session, (first, second, third, fourth, fifth), ids, users, _ = _world(app, monkeypatch, players=6)
        for s in (first, second, third, fourth, fifth):
            meta = _bubble(ids[s])
            assert (meta["notificationEventId"], "responded" in meta) == (-ids[s], False)

    def answer(who, action):
        return client.post("/api/app/notify/respond", json={"invitationId": ids[who], "action": action},
                           headers=_token(app, users[who]))

    assert answer(first, "no").get_json()["action"] == "declined"
    assert answer(second, "yes").get_json()["action"] == "confirmed"          # the last spot (capacity 2)
    assert answer(third, "yes").get_json()["action"] == "sorry"
    with app.app_context():
        assert _closed(_bubble(ids[first])) == ("answered", True, "no")
        assert _closed(_bubble(ids[second])) == ("answered", True, "yes")
        assert _closed(_bubble(ids[third])) == ("sorry", True, "spot_filled")
        assert _bubble(ids[second])["notificationEventId"] == -ids[second]   # kept on every write
        # The other closing states, written by the store's one choke point (engine-store rule 8).
        expected = {"closed_same_hour": "booked_same_day", "withdrawn": "withdrawn", "reopened": "reopened",
                    "class_cancelled": "class_cancelled"}
        for state, response in expected.items():
            row = db.session.get(EngineInvitation, ids[fourth])
            _refresh_bubbles(row, state)
            db.session.commit()
            assert _closed(_bubble(ids[fourth])) == (state, True, response)


@pytest.mark.criterion("NOTIFICATIONS-INVITATIONS-130")
def test_an_open_bubble_reads_expired_once_the_class_has_started(app, monkeypatch):
    from padel_app.models import EngineInvitation, Message
    from padel_app.serializers.message import serialize_message
    from padel_app.tests.helpers import pin_clock

    with app.app_context():
        _, _, (student, *_), ids, users, _ = _world(app, monkeypatch)
        msg = db.session.get(Message, list(db.session.get(EngineInvitation, ids[student]).message_ids)[-1])
        before = serialize_message(msg, None, viewer_id=users[student])["metadata"]
        assert "responded" not in before
        pin_clock(monkeypatch, START + timedelta(minutes=1))                  # START is UTC in November
        after = serialize_message(msg, None, viewer_id=users[student])["metadata"]
        assert (after["responded"], after["response"], after["state"]) == (True, "expired", "open")
        db.session.expire_all()
        assert "responded" not in db.session.get(Message, msg.id).msg_metadata   # the stored row is unchanged


@pytest.mark.criterion("NOTIFICATIONS-INVITATIONS-131")
def test_the_answer_routes_take_an_old_builds_negative_id(app, client, monkeypatch):
    with app.app_context():
        store, session, (first, second, third, fourth, fifth), ids, users, coach_user = _world(
            app, monkeypatch, players=6)

    def old(who, invitation, action, route="respond", headers=None):
        return client.post(f"/api/app/notify/{route}", json={"notificationEventId": -invitation, "action": action},
                           headers=headers or _token(app, users[who]))

    assert old(first, ids[first], "no").get_json() == {"action": "declined"}
    assert old(second, ids[second], "yes").get_json() == {"action": "confirmed"}
    assert old(third, ids[third], "yes").get_json() == {"action": "spot_filled"}       # the engine's sorry
    by_coach = old(fourth, ids[fourth], "no", route="coach_respond", headers=_token(app, coach_user))
    assert by_coach.get_json() == {"action": "declined"}
    with app.app_context():
        from padel_app.models import EngineInvitation

        assert db.session.get(EngineInvitation, ids[fourth]).answered_by == "coach"
    # NB5's body answers as before.
    assert client.post("/api/app/notify/respond", json={"invitationId": ids[fifth], "action": "no"},
                       headers=_token(app, users[fifth])).get_json() == {"action": "declined",
                                                                         "invitationId": ids[fifth]}
    # Neither id: a 400, never a 500.
    assert client.post("/api/app/notify/respond", json={"action": "yes"},
                       headers=_token(app, users[first])).status_code == 400



@pytest.mark.criterion("NOTIFICATIONS-INVITATIONS-131")
def test_an_old_builds_answer_after_the_start_or_the_cancellation_is_expired(app, client, monkeypatch):
    from padel_app.models.lesson_instances import LessonInstance
    from padel_app.services.engine_entry import withdraw_before_removal
    from padel_app.tests.helpers import pin_clock

    with app.app_context():
        store, session, (late, _, _), ids, users, _ = _world(app, monkeypatch, players=4, capacity=4)

    def old(who, action="yes"):
        return client.post("/api/app/notify/respond", json={"notificationEventId": -ids[who], "action": action},
                           headers=_token(app, users[who]))

    with app.app_context():
        pin_clock(monkeypatch, START + timedelta(minutes=1))
    assert old(late).get_json() == {"action": "expired"}                     # the class has started
    with app.app_context():
        pin_clock(monkeypatch, NOW)
        withdraw_before_removal([db.session.get(LessonInstance, int(session))])
        db.session.commit()
    assert old(late).get_json() == {"action": "expired"}                     # its class was cancelled


@pytest.mark.criterion("NOTIFICATIONS-INVITATIONS-132")
def test_an_old_builds_home_card_answers_a_new_engine_invitation(app, client, monkeypatch):
    from padel_app.helpers.dashboard.player_home import _vacancy_invite_items
    from padel_app.models.presences import Presence

    with app.app_context():
        store, session, (student, *_), ids, users, _ = _world(app, monkeypatch)
        (item,) = _vacancy_invite_items(player_id=int(student), now=NOW)
        assert (item["notificationEventId"], item["invitationId"]) == (-ids[student], ids[student])

    answer = client.post("/api/app/notify/respond", json={"notificationEventId": item["notificationEventId"],
                                                          "action": "yes"}, headers=_token(app, users[student]))
    assert answer.get_json() == {"action": "confirmed"}
    with app.app_context():
        assert Presence.query.filter_by(lesson_instance_id=int(session), player_id=int(student)).one() is not None
        meta = _bubble(ids[student])
        assert (meta["responded"], meta["response"]) == (True, "yes")


@pytest.mark.criterion("NOTIFICATIONS-INVITATIONS-133")
def test_the_class_detail_rows_and_the_withdrawal_route_serve_old_and_current_builds(app, client, monkeypatch):
    from padel_app.models.lesson_instances import LessonInstance
    from padel_app.services.engine_readers import engine_invitees

    with app.app_context():
        store, session, (first, second, third), ids, users, coach_user = _world(app, monkeypatch, players=4,
                                                                                capacity=4)
        rows = {r["invitationId"]: r for r in engine_invitees(db.session.get(LessonInstance, int(session)))}
        assert {i: rows[i]["id"] for i in rows} == {ids[s]: -ids[s] for s in (first, second, third)}
        other_coach_user = _another_coach_user()

    coach = _token(app, coach_user)
    old = client.delete(f"/api/app/notify/invitations/{-ids[first]}", headers=coach)
    assert old.status_code == 200 and old.get_json() == {"action": "withdrawn"}
    current = client.delete(f"/api/app/notify/invitations/{ids[second]}", query_string={"engine": "new"},
                            headers=coach)
    assert current.get_json() == {"action": "withdrawn"}
    with app.app_context():
        assert _closed(_bubble(ids[first])) == ("withdrawn", True, "withdrawn")
    assert client.post("/api/app/notify/respond", json={"invitationId": ids[third], "action": "yes"},
                       headers=_token(app, users[third])).get_json()["action"] == "confirmed"
    assert client.delete(f"/api/app/notify/invitations/{-ids[third]}", headers=coach).get_json() == {
        "action": "confirmed"}
    assert client.delete(f"/api/app/notify/invitations/{-ids[third]}",
                         headers=_token(app, other_coach_user)).status_code == 403
    assert client.delete("/api/app/notify/invitations/-999999", headers=coach).status_code == 404


def _another_coach_user():
    from padel_app.models import User
    from padel_app.models.coaches import Coach

    user = User(name="Other", username="shim-other-coach", password="x", status="active")
    db.session.add(user)
    db.session.flush()
    db.session.add(Coach(user_id=user.id))
    db.session.commit()
    return user.id


@pytest.mark.criterion("NOTIFICATIONS-INVITATIONS-133")
def test_a_new_engine_withdrawal_never_touches_an_old_invitation_of_the_same_number(app, client, monkeypatch):
    """The wrong-row bug on staging before NB6: the withdrawal route ignored ``?engine=new`` and ran the old
    engine's withdrawal by that number, so web's withdrawal of new-engine invitation N (and an old iOS
    build's, by the row id) withdrew the same coach's unrelated old invitation N instead."""
    from padel_app.models import EngineInvitation, NotificationEvent

    with app.app_context():
        store, session, (first, second, _), ids, users, coach_user = _world(app, monkeypatch, players=4, capacity=4)
        coach_id = store.coach_of(session)
        for n in (ids[first], ids[second]):                                  # an old invitation of the same number
            db.session.add(NotificationEvent(id=n, coach_id=coach_id, lesson_instance_id=int(session),
                                             player_id=int(first), type="manual", round_number=1, status="sent"))
        db.session.commit()

    def old_and_engine(s):
        db.session.expire_all()
        old = db.session.get(NotificationEvent, ids[s])
        return (old.status, old.withdrawn_by_coach_at), db.session.get(EngineInvitation, ids[s]).closed_reason

    coach = _token(app, coach_user)
    current = client.delete(f"/api/app/notify/invitations/{ids[first]}", query_string={"engine": "new"}, headers=coach)
    with app.app_context():
        assert old_and_engine(first) == (("sent", None), "withdrawn")        # the old one untouched, the engine's gone
    old_build = client.delete(f"/api/app/notify/invitations/{-ids[second]}", headers=coach)
    with app.app_context():
        assert old_and_engine(second) == (("sent", None), "withdrawn")
    assert (current.get_json(), old_build.get_json()) == ({"action": "withdrawn"}, {"action": "withdrawn"})
