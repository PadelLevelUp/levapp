"""PAD-659 — calendar.event-detail rule 24 (numbering unconfirmed): every write that moves a
presence publishes `presence_changed {lessonInstanceId, playerId}` to the class's coach, after
the commit, so the coach's open class regroups its participants live. A student never receives
it.

Before PAD-659 a student's reminder answer only edited the reminder message, and nothing at all
reached the coach's open class for a cancellation without a reminder or for the coach's own
marks from another tab.
"""
from padel_app.sql_db import db
from padel_app.tests.test_pad128_eligibility import _add_student
from padel_app.tests.test_pad358_academy_classes import _add_class, _setup


def _capture(monkeypatch):
    monkeypatch.setattr("padel_app.utils.push_notifications.send_push_notification", lambda **kw: None)
    monkeypatch.setattr("padel_app.utils.expo_push.send_expo_push_to_user", lambda user_id, **kw: None)
    events = []

    def record(event, recipients):
        events.append((event["type"], dict(event.get("payload") or {}), sorted(recipients)))

    # Every module that imported `publish` by name, plus the source.
    for target in (
        "padel_app.realtime.publish",
        "padel_app.services.notification_service.publish",
        "padel_app.services.lesson_service.publish",
    ):
        monkeypatch.setattr(target, record, raising=False)
    return events


def _presence_events(events):
    return [e for e in events if e[0] == "presence_changed"]


def _class_with_student(app, ids, *, days=3):
    from padel_app.models.lesson_instances import LessonInstance
    from padel_app.models.players import Player
    from padel_app.models.coaches import Coach
    from padel_app.services.lesson_service import enrol

    cls = _add_class(app, ids, days=days, title="Rule24")
    with app.app_context():
        enrol(ids["student_id"], db.session.get(LessonInstance, cls["instance_id"]), "coach")
        db.session.commit()
        return {
            "instance_id": cls["instance_id"],
            "student_user_id": db.session.get(Player, ids["student_id"]).user_id,
            "coach_user_id": db.session.get(Coach, ids["coach_id"]).user_id,
        }


def _expected(c, ids):
    return ("presence_changed", {"lessonInstanceId": c["instance_id"], "playerId": ids["student_id"]},
            [c["coach_user_id"]])


def test_a_reminder_answer_tells_the_coach(app, monkeypatch):
    from padel_app.services.notification_service import respond_to_reminder, send_class_reminders

    ids = _setup(app)
    c = _class_with_student(app, ids)
    events = _capture(monkeypatch)
    with app.app_context():
        send_class_reminders(c["instance_id"])  # PAD-570: "Vou" only once asked
        events.clear()
        assert respond_to_reminder(c["instance_id"], "yes", c["student_user_id"]) == {"action": "confirmed"}
    assert _presence_events(events) == [_expected(c, ids)]

    events.clear()
    with app.app_context():
        assert respond_to_reminder(c["instance_id"], "no", c["student_user_id"]) == {"action": "declined"}
    assert _presence_events(events) == [_expected(c, ids)]


def test_a_cancellation_tells_the_coach(app, monkeypatch):
    from padel_app.services.notification_service import cancel_attendance

    ids = _setup(app)
    c = _class_with_student(app, ids)
    events = _capture(monkeypatch)
    with app.app_context():  # a planned student giving the spot up early: a proactive decline
        cancel_attendance(c["student_user_id"], lesson_instance_id=c["instance_id"])
    assert _expected(c, ids) in _presence_events(events)
    assert all(e[2] == [c["coach_user_id"]] for e in _presence_events(events)), "never to the student"


def test_the_coachs_mark_and_clear_tell_the_coach(app, monkeypatch):
    from padel_app.models.lesson_instances import LessonInstance
    from padel_app.services.lesson_service import add_presences

    ids = _setup(app)
    c = _class_with_student(app, ids)
    events = _capture(monkeypatch)
    with app.app_context():
        add_presences(db.session.get(LessonInstance, c["instance_id"]),
                      [{"playerId": ids["student_id"], "status": "present"}])
        db.session.commit()
    assert _presence_events(events) == [_expected(c, ids)]

    events.clear()
    with app.app_context():
        add_presences(db.session.get(LessonInstance, c["instance_id"]),
                      [{"playerId": ids["student_id"], "clear": True}])
        db.session.commit()
    assert _presence_events(events) == [_expected(c, ids)]

