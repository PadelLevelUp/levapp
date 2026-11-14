"""
PAD-820 (notifications.reminders rule 24; owner 2026-11-14, option b): on an old-engine class a
student who joined by accepting an invitation (a fill: `confirmed` already true, `response` `none`)
is asked by the reminder pass like everyone going, when they were placed by the class's first
reminder time (`placed_at`). One placed after it, or back in a seat they had given up, is asked by no pass and gets no late ask: they have just said
yes. A recorded answer (here the system's "coming", rule 22) still stops the reminder.
"""
import pytest
from datetime import datetime, timedelta
from unittest.mock import patch

from padel_app.sql_db import db

PATCHES = (
    "padel_app.services.notification_service.publish",
    "padel_app.services.notification_service.send_push_notification",
    "padel_app.services.system_messages.publish",
    "padel_app.services.system_messages.send_push_notification",
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
        u = User(name=name.title(), username=f"p820{name}", email=f"p820{name}@t.test",
                 password="x", status="active")
        db.session.add(u)
        db.session.flush()
        return u

    coach = Coach(user_id=user("coach").id)
    club = Club(name="P820", description="", location="Lisboa")
    db.session.add_all([coach, club])
    db.session.flush()
    lesson = Lesson(title="P820", start_datetime=START, end_datetime=START + timedelta(hours=1),
                    is_recurring=False, type="academy", max_players=8, color="#000",
                    status="active", club_id=club.id)
    db.session.add(lesson)
    db.session.flush()
    inst = LessonInstance(lesson_id=lesson.id, start_datetime=START, end_datetime=START + timedelta(hours=1),
                          max_players=8, status="scheduled", notifications_enabled=True,
                          original_lesson_occurence_date=START.date())
    db.session.add(inst)
    db.session.flush()
    db.session.add(Association_CoachLessonInstance(coach_id=coach.id, lesson_instance_id=inst.id))
    ids = {}
    for name in ("ana", "dora", "eva", "fabio"):
        u = user(name)
        p = Player(user_id=u.id)
        db.session.add(p)
        db.session.flush()
        ids[name] = p.id
    db.session.add(Presence(player_id=ids["ana"], lesson_instance_id=inst.id, invited=True,
                            enrolment_source="roster"))
    cfg = NotificationConfig(coach_id=coach.id, auto_notify_enabled=True)
    db.session.add(cfg)
    db.session.flush()
    cfg.reminder_timing = {"reminderCount": reminder_count, "hoursBetweenReminders": 6}
    db.session.commit()
    return inst.id, ids


def _fill(instance_id, player_id, at):
    """The old engine's invitation "yes": `_add_player_to_instance`, placed at `at` (naive UTC)."""
    from padel_app.models.lesson_instances import LessonInstance
    from padel_app.models.presences import Presence
    from padel_app.services.notification_service import _add_player_to_instance

    _add_player_to_instance(player_id, db.session.get(LessonInstance, instance_id))
    p = Presence.query.filter_by(lesson_instance_id=instance_id, player_id=player_id).one()
    p.placed_at = at
    db.session.commit()
    assert (p.enrolment_source, p.confirmed, p.response) == ("fill", True, "none")


def _reminded(instance_id):
    from padel_app.services import reminder_attempt_service as attempts
    from padel_app.models.presences import Presence
    return {p.player_id: attempts.count_attempts(instance_id, p.player_id)
            for p in Presence.query.filter_by(lesson_instance_id=instance_id).all()}


@pytest.mark.criterion("NOTIFICATIONS-REMINDERS-35")
def test_an_invitation_joiner_placed_before_the_first_reminder_is_asked(app):
    from padel_app.models.presences import Presence
    from padel_app.services.lesson_service import enrol
    from padel_app.models.lesson_instances import LessonInstance
    from padel_app.services.notification_service import proactive_decline_deadline, send_class_reminders
    from padel_app.services.presence_response import record_response

    with app.app_context(), patch(PATCHES[0]), patch(PATCHES[1]), patch(PATCHES[2]), patch(PATCHES[3]):
        instance_id, ids = _seed()
        inst = db.session.get(LessonInstance, instance_id)
        first = proactive_decline_deadline(inst)
        _fill(instance_id, ids["dora"], first - timedelta(days=7))
        eva = enrol(ids["eva"], inst, "coach")
        eva.confirmed = True
        record_response(eva, "confirmed", recorded_by="system")
        db.session.commit()

        send_class_reminders(instance_id, now=first)
        assert _reminded(instance_id) == {ids["ana"]: 1, ids["dora"]: 1, ids["eva"]: 0}
        assert Presence.query.filter_by(lesson_instance_id=instance_id, player_id=ids["dora"]).one().response == "none"


@pytest.mark.criterion("NOTIFICATIONS-REMINDERS-35")
def test_an_invitation_joiner_placed_after_the_first_reminder_is_not_asked_by_a_later_pass(app):
    from padel_app.models.lesson_instances import LessonInstance
    from padel_app.services.notification_service import (
        next_ask_time, proactive_decline_deadline, send_class_reminders,
    )

    with app.app_context(), patch(PATCHES[0]), patch(PATCHES[1]), patch(PATCHES[2]), patch(PATCHES[3]):
        instance_id, ids = _seed(reminder_count=2)
        inst = db.session.get(LessonInstance, instance_id)
        first = proactive_decline_deadline(inst)
        send_class_reminders(instance_id, now=first)
        _fill(instance_id, ids["fabio"], first + timedelta(hours=1))
        _fill(instance_id, ids["dora"], first - timedelta(hours=1))   # before the first: asked by the next pass
        send_class_reminders(instance_id, now=first + timedelta(hours=6))
        sent = _reminded(instance_id)
        assert sent[ids["fabio"]] == 0
        assert sent[ids["dora"]] == 1
        assert sent[ids["ana"]] == 2
        assert next_ask_time(inst, ids["fabio"], now=first + timedelta(hours=7)) is None


@pytest.mark.criterion("NOTIFICATIONS-REMINDERS-35")
def test_a_student_back_through_an_invitation_after_the_first_reminder_is_not_asked(app):
    """The returning row keeps its original created_at; the new seat's placed_at is what counts."""
    from padel_app.models.lesson_instances import LessonInstance
    from padel_app.models.presences import Presence
    from padel_app.services.notification_service import (
        _add_player_to_instance, proactive_decline_deadline, send_class_reminders,
    )

    with app.app_context(), patch(PATCHES[0]), patch(PATCHES[1]), patch(PATCHES[2]), patch(PATCHES[3]):
        instance_id, ids = _seed(reminder_count=2)
        inst = db.session.get(LessonInstance, instance_id)
        first = proactive_decline_deadline(inst)
        send_class_reminders(instance_id, now=first)
        ana = Presence.query.filter_by(lesson_instance_id=instance_id, player_id=ids["ana"]).one()
        ana.status, ana.justification, ana.confirmed = "absent", "justified", True   # said no
        db.session.commit()
        # then took a spot again by invitation, an hour after the first reminder
        with patch("padel_app.utils.dates.utcnow_naive", return_value=first + timedelta(hours=1)):
            _add_player_to_instance(ids["ana"], inst)
        db.session.commit()
        ana = Presence.query.filter_by(lesson_instance_id=instance_id, player_id=ids["ana"]).one()
        assert (ana.status, ana.response, ana.confirmed) == (None, "none", True)
        assert ana.created_at <= first < ana.placed_at
        send_class_reminders(instance_id, now=first + timedelta(hours=6))
        assert _reminded(instance_id)[ids["ana"]] == 0


@pytest.mark.criterion("NOTIFICATIONS-REMINDERS-35")
def test_a_new_engine_placement_is_left_to_the_engine(app):
    from padel_app.models.lesson_instances import LessonInstance
    from padel_app.models.presences import Presence
    from padel_app.services.notification_service import answered_for_reminders, proactive_decline_deadline

    with app.app_context():
        instance_id, ids = _seed()
        inst = db.session.get(LessonInstance, instance_id)
        first = proactive_decline_deadline(inst)
        _fill(instance_id, ids["dora"], first - timedelta(days=1))
        dora = Presence.query.filter_by(lesson_instance_id=instance_id, player_id=ids["dora"]).one()
        assert answered_for_reminders(dora, first) is False
        assert answered_for_reminders(dora, first, new_engine=True) is True
