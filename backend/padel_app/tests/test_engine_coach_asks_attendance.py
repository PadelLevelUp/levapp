"""Engine plan item #16: the coach's "send reminders" on a new-engine class is the engine's
``CoachRequestsAttendance`` (notifications.engine-timeline rule 8; notifications.class-reminders-manual rules
5-6). The engine asks at once every going student its schedule would ask, writes each ask as it writes a
scheduled one (a ``ReminderAttempt`` and the reminder message), plans nothing, and names every going student
it did not ask with one cause; the route adds the students it keeps out (unavailable, blocked all, the
coach's marks).

``_seed`` (test_pad916_engine_store): one coach, a level-3 class at START, the first student its regular on
the left, the others in the coach's pool; NOW is two hours before.
"""
from datetime import timedelta

import pytest
from flask_jwt_extended import create_access_token

from padel_app.invitation_engine import effects as fx
from padel_app.sql_db import db
from padel_app.tests.helpers import pin_clock
from padel_app.tests.test_pad916_engine_store import NOW, START, _seed


@pytest.fixture(autouse=True)
def _context(app, monkeypatch):
    from padel_app.utils import expo_push, push_notifications

    app.config["JWT_SECRET_KEY"] = "test-secret"
    monkeypatch.setattr(push_notifications, "send_push_notification", lambda **kw: None)
    monkeypatch.setattr(expo_push, "send_expo_push_to_user", lambda *a, **k: None)
    pin_clock(monkeypatch, NOW)
    with app.app_context():
        yield


def _coach_user(store, session):
    from padel_app.models.coaches import Coach

    return db.session.get(Coach, store.coach_of(session)).user_id


def _send_reminders(client, store, session):
    token = create_access_token(identity=str(_coach_user(store, session)))
    body = {"model": "LessonInstance", "originalId": int(session)}
    return client.post("/api/app/notify/send_reminders", json=body, headers={"Authorization": f"Bearer {token}"})


def _place(store, session, students, how="regular", at=NOW - timedelta(days=1)):
    with store.unit((session,)):
        store.apply([fx.Placed(session, at, s, "L", how) for s in students])


def _user(pid):
    from padel_app.models.players import Player

    return db.session.get(Player, int(pid)).user


def _attempts(session, student=None):
    from padel_app.models import ReminderAttempt

    q = ReminderAttempt.query.filter_by(lesson_instance_id=int(session))
    return q.filter_by(player_id=int(student)).all() if student is not None else q.all()


def _reminders_to(student):
    from padel_app.models import Message

    user_id = _user(student).id
    return [m for m in Message.query.filter_by(message_type="notification_reminder").order_by(Message.id).all()
            if user_id in {p.user_id for p in m.conversation.participants} and m.sender_id != user_id]


def _presence(session, student):
    from padel_app.models.presences import Presence

    return Presence.query.filter_by(lesson_instance_id=int(session), player_id=int(student)).one()


@pytest.mark.criterion("NOTIFICATIONS-ENGINE-TIMELINE-30")
def test_the_coachs_ask_is_stored_and_answered_as_a_scheduled_request(app):
    from padel_app.models import EngineInvitation
    from padel_app.models.lesson_instances import LessonInstance
    from padel_app.services.engine_entry import answer_attendance_request, coach_asks_attendance
    from padel_app.services.engine_runner import engine

    store, (s,), (regular, *_pool) = _seed(app, players=3, side="left", capacity=4)
    inst = db.session.get(LessonInstance, int(s))

    asked, not_asked = coach_asks_attendance(inst, {}, NOW)
    assert asked == [int(regular)] and not_asked == {}
    [attempt] = _attempts(s, regular)
    assert attempt.sent_at == NOW and attempt.number == 1
    [reminder] = _reminders_to(regular)
    assert reminder.msg_metadata["lessonInstanceId"] == int(s) and reminder.msg_metadata["reminderNumber"] == 1
    assert attempt.message_id == reminder.id
    # The ask planned nothing, although a run now would invite for the open spots.
    assert EngineInvitation.query.filter_by(lesson_instance_id=int(s)).count() == 0
    assert any(isinstance(e, fx.Invited) for e in engine(NOW).plan(s, NOW))

    # The regular's Yes to it records them confirmed, as for a scheduled request.
    answer_attendance_request(inst, _presence(s, regular), "yes", NOW + timedelta(minutes=5))
    assert _attempts(s, regular)[0].response == "yes"
    asked, not_asked = coach_asks_attendance(inst, {}, NOW + timedelta(minutes=10))
    assert asked == [] and not_asked == {int(regular): "already_confirmed"}
    assert len(_attempts(s, regular)) == 1


@pytest.mark.criterion("NOTIFICATIONS-CLASS-REMINDERS-MANUAL-2")
def test_send_reminders_on_a_new_engine_class_asks_through_the_engine(app, client):
    from padel_app.models import EngineInvitation

    store, (s,), (regular, other, *_) = _seed(app, players=3, side="left", capacity=4)
    _place(store, s, [other])

    res = _send_reminders(client, store, s)
    assert res.status_code == 200, res.get_json()
    assert res.get_json() == {"sent": 2, "blocked": []}
    for student in (regular, other):
        [attempt] = _attempts(s, student)
        assert attempt.sent_at == NOW
        [reminder] = _reminders_to(student)
        assert reminder.msg_metadata["lessonInstanceId"] == int(s)
    assert EngineInvitation.query.filter_by(lesson_instance_id=int(s)).count() == 0


@pytest.mark.criterion("NOTIFICATIONS-CLASS-REMINDERS-MANUAL-3")
def test_send_reminders_on_a_new_engine_class_names_every_student_not_asked(app, client):
    from padel_app.models import CalendarBlock, ReminderAttempt
    from padel_app.services.engine_store import settings_for

    store, (s,), pids = _seed(app, players=9, side="left", capacity=10)
    plain, away, blocker, yes, present, absent_mark, said_no, capped, _spare = pids
    _place(store, s, [away, blocker, yes, present, absent_mark, said_no, capped])
    with store.unit((s,)):
        store.apply([fx.Left(s, NOW - timedelta(hours=1), said_no, "regular_no")])
    db.session.add(CalendarBlock(user_id=_user(away).id, type="unavailable", start_datetime=START - timedelta(hours=1),
                                 end_datetime=START + timedelta(hours=2), blocks_auto_invitations=True))
    _user(blocker).notif_block_all, _user(blocker).notif_block_reason = True, "On holiday"
    db.session.add(ReminderAttempt(lesson_instance_id=int(s), player_id=int(yes), number=1,
                                   sent_at=NOW - timedelta(days=1), response="yes", responded_at=NOW - timedelta(hours=20)))
    _presence(s, present).status = "present"
    _presence(s, absent_mark).status = "absent"
    cap = settings_for(s).attendance_request.max
    for n in range(cap):
        db.session.add(ReminderAttempt(lesson_instance_id=int(s), player_id=int(capped), number=n + 1,
                                       sent_at=NOW - timedelta(days=1, hours=n)))
    db.session.commit()
    before = {p: len(_attempts(s, p)) for p in pids}

    res = _send_reminders(client, store, s)
    assert res.status_code == 200, res.get_json()
    body = res.get_json()
    assert body["sent"] == 1
    causes = {str(b["playerId"]): b["cause"] for b in body["blocked"]}
    assert len(body["blocked"]) == len(causes) == 7
    assert causes == {away: "unavailable", blocker: "preference", yes: "already_confirmed",
                      present: "already_confirmed", absent_mark: "not_coming", said_no: "not_coming",
                      capped: "reminder_limit"}
    [pref] = [b for b in body["blocked"] if b["cause"] == "preference"]
    assert pref["reason"] == "On holiday" and pref["name"] == _user(blocker).name
    assert all(b["name"] == _user(b["playerId"]).name for b in body["blocked"])
    after = {p: len(_attempts(s, p)) for p in pids}
    assert after[plain] == before[plain] + 1
    assert all(after[p] == before[p] for p in pids if p != plain)


@pytest.mark.criterion("NOTIFICATIONS-CLASS-REMINDERS-MANUAL-4")
def test_send_reminders_on_a_started_cancelled_or_completed_new_engine_class_asks_nobody(app, client):
    from padel_app.models import CalendarBlock
    from padel_app.models.lesson_instances import LessonInstance

    started_at = NOW - timedelta(minutes=30)
    store, sessions, (regular, *_) = _seed(app, starts=(started_at, START, START + timedelta(hours=1)), players=2)
    started, cancelled, completed = sessions
    db.session.add(CalendarBlock(user_id=_user(regular).id, type="unavailable", start_datetime=NOW - timedelta(hours=2),
                                 end_datetime=START + timedelta(hours=3), blocks_auto_invitations=True))
    db.session.get(LessonInstance, int(cancelled)).status = "canceled"
    db.session.get(LessonInstance, int(completed)).status = "completed"
    db.session.commit()

    for s in sessions:
        res = _send_reminders(client, store, s)
        assert res.status_code == 200, (s, res.get_json())
        assert res.get_json() == {"sent": 0, "blocked": []}
    assert all(_attempts(s) == [] for s in sessions)
