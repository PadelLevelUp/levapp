"""PAD-259 — classes.instance-enrollment rules 4-7 on the engine side: the
presence row is the enrolment, so capacity, fills and reminder answers all read
and write that one table.
"""
from datetime import datetime, timedelta
from unittest.mock import patch

from padel_app.sql_db import db
from padel_app.tests.test_notification_reminder_flow import (
    PATCHES,
    _seed_coach_and_student,
    _seed_instance,
)


def _second_student(app, coach_id, username="second"):
    from padel_app.models import Association_CoachPlayer, User
    from padel_app.models.players import Player

    with app.app_context():
        user = User(name=username, username=username, email=f"{username}@t.com", password="x", status="active")
        db.session.add(user)
        db.session.flush()
        player = Player(user_id=user.id)
        db.session.add(player)
        db.session.flush()
        db.session.add(Association_CoachPlayer(coach_id=coach_id, player_id=player.id))
        db.session.commit()
        return player.id, user.id


# ── criterion: capacity counts presences, and a decline frees the spot ──

def test_capacity_counts_presences_and_a_decline_frees_the_spot(app):
    from padel_app.models import LessonInstance
    from padel_app.services.class_join_request_service import _is_enrolled, _is_full
    from padel_app.services.lesson_service import enrol
    from padel_app.services.notification_service import respond_to_reminder, send_class_reminders

    ids = _seed_coach_and_student(app)
    instance_id = _seed_instance(app, ids["coach_id"], ids["student_id"], start_offset_hours=48)
    carol, carol_uid = _second_student(app, ids["coach_id"], "carol")
    with app.app_context():
        instance = db.session.get(LessonInstance, instance_id)
        instance.max_players = 2
        db.session.commit()
        enrol(carol, instance, "coach")
        instance = db.session.get(LessonInstance, instance_id)
        assert instance.effective_filled_spots == 2
        assert _is_full(instance) is True
        assert _is_enrolled(instance, carol) is True

        with patch(PATCHES[0]), patch(PATCHES[1]):
            send_class_reminders(instance_id, now=datetime.utcnow())
            respond_to_reminder(instance_id, "no", carol_uid)
        instance = db.session.get(LessonInstance, instance_id)
        assert instance.effective_filled_spots == 1
        assert _is_full(instance) is False


# ── criterion: the vacancy fill path enrols once ──

def test_the_fill_path_enrols_once_with_source_fill(app):
    from padel_app.models import LessonInstance, NotificationEvent, Presence
    from padel_app.services.notification_service import respond_to_notification, trigger_invitations
    from padel_app.tests.test_pad261_one_winner import _world

    coach_id, instance_id, players = _world(app)
    with app.app_context():
        with patch(PATCHES[0]), patch(PATCHES[1]):
            trigger_invitations(db.session.get(LessonInstance, instance_id), coach_id)
        event = NotificationEvent.query.filter_by(lesson_instance_id=instance_id, status="sent").first()
        user_id = next(u for p, u in players if p == event.player_id)
        with patch(PATCHES[0]), patch(PATCHES[1]):
            respond_to_notification(event.id, "yes", user_id)
            respond_to_notification(event.id, "yes", user_id)
        rows = Presence.query.filter_by(lesson_instance_id=instance_id, player_id=event.player_id).all()
        assert len(rows) == 1
        assert rows[0].enrolment_source == "fill"
        assert rows[0].confirmed is True
        assert db.session.get(LessonInstance, instance_id).effective_filled_spots == 1


# ── criterion: an answer from a removed player creates nothing (rule 7) ──

def test_an_answer_from_a_removed_player_is_recorded_but_enrols_nobody(app):
    from padel_app.models import (
        Association_PlayerLesson, LessonInstance, NotificationEvent, Presence, ReminderAttempt, Vacancy,
    )
    from padel_app.services.lesson_service import unenrol
    from padel_app.services.notification_service import respond_to_reminder, send_class_reminders

    ids = _seed_coach_and_student(app)
    instance_id = _seed_instance(app, ids["coach_id"], ids["student_id"], start_offset_hours=48)
    with app.app_context():
        instance = db.session.get(LessonInstance, instance_id)
        # Still on the series roster: only this date was taken away.
        db.session.add(Association_PlayerLesson(player_id=ids["student_id"], lesson_id=instance.lesson_id))
        db.session.commit()
        t0 = datetime.utcnow()
        with patch(PATCHES[0]), patch(PATCHES[1]):
            sent = send_class_reminders(instance_id, now=t0)
        assert sent["sent"] == 1
        unenrol(ids["student_id"], db.session.get(LessonInstance, instance_id))
        assert Presence.query.filter_by(lesson_instance_id=instance_id).count() == 0

        with patch(PATCHES[0]), patch(PATCHES[1]):
            result = respond_to_reminder(instance_id, "no", ids["student_user_id"], now=t0 + timedelta(minutes=5))
        assert result == {"action": "not_enrolled"}
        assert Presence.query.filter_by(lesson_instance_id=instance_id).count() == 0
        assert Vacancy.query.filter_by(lesson_instance_id=instance_id).count() == 0
        assert NotificationEvent.query.filter_by(lesson_instance_id=instance_id).count() == 0
        attempt = ReminderAttempt.query.filter_by(lesson_instance_id=instance_id, player_id=ids["student_id"]).one()
        assert attempt.responded_at is not None or attempt.superseded is True
