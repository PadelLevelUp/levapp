"""
PAD-546 — a reminder pass skips a student the coach already marked present or absent
(notifications.reminders rule 23). `Presence.status` is the coach's record only (attendance.presence
rule 7) and is read when each pass runs, so clearing a mark brings the reminder back.
"""
from datetime import datetime, timedelta
from unittest.mock import patch

from padel_app.sql_db import db

PATCHES = (
    "padel_app.services.notification_service.publish",
    "padel_app.services.notification_service.send_push_notification",
)
START = datetime(2027, 7, 12, 18, 0)


def _seed(reminder_count=1):
    from padel_app.models.Association_CoachLessonInstance import Association_CoachLessonInstance
    from padel_app.models.clubs import Club
    from padel_app.models.coaches import Coach
    from padel_app.models.lesson_instances import LessonInstance
    from padel_app.models.lessons import Lesson
    from padel_app.models.notification_config import NotificationConfig
    from padel_app.models.players import Player
    from padel_app.models.presences import Presence
    from padel_app.models.users import User

    def user(name):
        u = User(name=name.title(), username=f"p546{name}", email=f"p546{name}@t.test",
                 password="x", status="active")
        db.session.add(u)
        db.session.flush()
        return u

    coach = Coach(user_id=user("coach").id)
    club = Club(name="P546", description="", location="Lisboa")
    db.session.add_all([coach, club])
    db.session.flush()
    lesson = Lesson(title="P546", start_datetime=START, end_datetime=START + timedelta(hours=1),
                    is_recurring=False, type="academy", max_players=4, color="#000",
                    status="active", club_id=club.id)
    db.session.add(lesson)
    db.session.flush()
    inst = LessonInstance(lesson_id=lesson.id, start_datetime=START, end_datetime=START + timedelta(hours=1),
                          max_players=4, status="scheduled", notifications_enabled=True,
                          original_lesson_occurence_date=START.date())
    db.session.add(inst)
    db.session.flush()
    db.session.add(Association_CoachLessonInstance(coach_id=coach.id, lesson_instance_id=inst.id))
    ids = {}
    for name in ("ana", "bruno", "carla"):
        u = user(name)
        p = Player(user_id=u.id)
        db.session.add(p)
        db.session.flush()
        db.session.add(Presence(player_id=p.id, lesson_instance_id=inst.id, invited=True,
                                enrolment_source="roster"))
        ids[name] = (p.id, u.id)
    cfg = NotificationConfig(coach_id=coach.id, auto_notify_enabled=True)
    db.session.add(cfg)
    db.session.flush()
    cfg.reminder_timing = {"reminderCount": reminder_count, "hoursBetweenReminders": 6}
    db.session.commit()
    return inst.id, ids


def _mark(instance_id, player_id, status, justification=None):
    from padel_app.models.presences import Presence
    p = Presence.query.filter_by(lesson_instance_id=instance_id, player_id=player_id).one()
    p.status, p.justification = status, justification
    db.session.commit()


def _reminded(instance_id):
    """Player user ids that received a reminder message, with counts."""
    from padel_app.services import reminder_attempt_service as attempts
    from padel_app.models.presences import Presence
    return {p.player_id: attempts.count_attempts(instance_id, p.player_id)
            for p in Presence.query.filter_by(lesson_instance_id=instance_id).all()}


def test_a_student_the_coach_marked_is_not_reminded(app):
    from padel_app.services.notification_service import send_class_reminders

    with app.app_context(), patch(PATCHES[0]), patch(PATCHES[1]):
        instance_id, ids = _seed()
        _mark(instance_id, ids["ana"][0], "present")
        _mark(instance_id, ids["bruno"][0], "absent", "justified")
        send_class_reminders(instance_id, now=START - timedelta(hours=47))
        sent = _reminded(instance_id)
        assert sent == {ids["ana"][0]: 0, ids["bruno"][0]: 0, ids["carla"][0]: 1}


def test_an_unjustified_absence_mark_also_skips(app):
    from padel_app.services.notification_service import send_class_reminders

    with app.app_context(), patch(PATCHES[0]), patch(PATCHES[1]):
        instance_id, ids = _seed()
        _mark(instance_id, ids["bruno"][0], "absent", "unjustified")
        send_class_reminders(instance_id, now=START - timedelta(hours=47))
        assert _reminded(instance_id)[ids["bruno"][0]] == 0


def test_the_mark_is_read_at_send_time_on_every_pass(app):
    from padel_app.services.notification_service import send_class_reminders

    with app.app_context(), patch(PATCHES[0]), patch(PATCHES[1]):
        instance_id, ids = _seed(reminder_count=2)
        _mark(instance_id, ids["bruno"][0], "absent", "justified")
        send_class_reminders(instance_id, now=START - timedelta(hours=47))
        assert _reminded(instance_id)[ids["bruno"][0]] == 0
        assert _reminded(instance_id)[ids["carla"][0]] == 1

        _mark(instance_id, ids["bruno"][0], None)
        _mark(instance_id, ids["carla"][0], "present")
        send_class_reminders(instance_id, now=START - timedelta(hours=40))
        sent = _reminded(instance_id)
        assert sent[ids["bruno"][0]] == 1, "a cleared mark brings the reminder back"
        assert sent[ids["carla"][0]] == 1, "a mark made between passes stops the follow-up"


def test_no_late_ask_is_armed_for_a_marked_student(app):
    from padel_app.models.lesson_instances import LessonInstance
    from padel_app.services.notification_service import next_ask_time

    with app.app_context():
        instance_id, ids = _seed()
        _mark(instance_id, ids["ana"][0], "present")
        inst = db.session.get(LessonInstance, instance_id)
        # Past the reminder time (48 h before), so an unmarked student would be asked now.
        now = START - timedelta(hours=20)
        assert next_ask_time(inst, ids["ana"][0], now=now) is None
        assert next_ask_time(inst, ids["carla"][0], now=now) is not None
