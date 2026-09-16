"""PAD-282 / PAD-288 — attendance.confirm rules 18-20: a student cancels an
occurrence that has no instance row yet. The cancel is sent as the calendar
event's (model, originalId, date); the server authorises on the series roster,
materialises the occurrence, then runs the ordinary decline path.

Repro shape from Session I (2026-09-11): a class request accepted for TOMORROW
schedules no reminder job (its fire time is past), so nothing materialises it
and the old endpoint had no instance to attach a cancel to.
"""
from datetime import datetime, timedelta, time
from unittest.mock import patch

import pytest
from werkzeug.exceptions import HTTPException

from padel_app.sql_db import db
from padel_app.tests.test_pad104_class_requests import _decide, _player, _setup
from padel_app.utils.dates import club_now_naive

PATCHES = [
    "padel_app.services.notification_service.publish",
    "padel_app.services.notification_service.send_push_notification",
]


def _requested_class(app, ids, day):
    """A one-off private class created from the student's own request."""
    from padel_app.models import ClassRequest
    from padel_app.services.class_request_service import create_class_request_service

    with app.app_context():
        row = create_class_request_service(
            _player(ids["player_id"]),
            {"coachId": ids["coach_id"], "date": day.isoformat(), "startTime": "10:00", "endTime": "11:00"},
        )
        rid = row.id
    assert _decide(app, ids, rid, "accept") == "accepted"
    with app.app_context():
        return db.session.get(ClassRequest, rid).lesson_id


def _student_user_id(app, pid):
    with app.app_context():
        return _player(pid).user_id


def _instances(app, lesson_id):
    from padel_app.models import LessonInstance

    with app.app_context():
        return LessonInstance.query.filter_by(lesson_id=lesson_id).all()


def _cancellation_messages(app, ids):
    from padel_app.models import Message

    with app.app_context():
        return [
            m for m in Message.query.all()
            if (m.msg_metadata or {}).get("cancellation") is True
        ]


# ── criterion: student cancels a class they requested for tomorrow (PAD-282) ──

def test_cancel_by_model_and_date_materialises_the_requested_class(app):
    from padel_app.models import LessonInstance, Presence
    from padel_app.services.notification_service import cancel_attendance

    ids = _setup(app)
    with app.app_context():
        tomorrow = club_now_naive().date() + timedelta(days=1)
    lesson_id = _requested_class(app, ids, tomorrow)
    assert _instances(app, lesson_id) == []
    uid = _student_user_id(app, ids["player_id"])

    with app.app_context():
        with patch(PATCHES[0]), patch(PATCHES[1]):
            result = cancel_attendance(
                uid, model="Lesson", original_id=lesson_id, date=tomorrow.isoformat()
            )
        assert result["action"] == "declined"
        assert result["proactive"] in (True, False)
        instances = LessonInstance.query.filter_by(lesson_id=lesson_id).all()
        assert len(instances) == 1
        assert instances[0].original_lesson_occurence_date == tomorrow
        presence = Presence.query.filter_by(
            lesson_instance_id=instances[0].id, player_id=ids["player_id"]
        ).one()
        assert (presence.status, presence.justification) == ("absent", "justified")
        assert presence.enrolment_source == "roster"
    assert len(_cancellation_messages(app, ids)) == 1


def test_the_endpoint_accepts_the_event_triple(app, client):
    from flask_jwt_extended import create_access_token
    from padel_app.models import LessonInstance

    ids = _setup(app)
    with app.app_context():
        tomorrow = club_now_naive().date() + timedelta(days=1)
    lesson_id = _requested_class(app, ids, tomorrow)
    app.config["JWT_SECRET_KEY"] = "test-jwt-secret"
    uid = _student_user_id(app, ids["player_id"])
    with app.app_context():
        headers = {"Authorization": f"Bearer {create_access_token(identity=str(uid))}"}
    with patch(PATCHES[0]), patch(PATCHES[1]):
        res = client.post(
            "/api/app/notify/cancel_attendance",
            json={"model": "Lesson", "originalId": lesson_id, "date": tomorrow.isoformat()},
            headers=headers,
        )
    assert res.status_code == 200, res.get_json()
    assert res.get_json()["action"] == "declined"
    with app.app_context():
        assert LessonInstance.query.filter_by(lesson_id=lesson_id).count() == 1


# ── criterion: the class-detail payload offers the action on a virtual occurrence ──

def test_class_instance_payload_carries_deadlines_for_a_virtual_occurrence(app, client):
    from flask_jwt_extended import create_access_token

    ids = _setup(app)
    with app.app_context():
        tomorrow = club_now_naive().date() + timedelta(days=1)
    lesson_id = _requested_class(app, ids, tomorrow)
    app.config["JWT_SECRET_KEY"] = "test-jwt-secret"
    uid = _student_user_id(app, ids["player_id"])
    with app.app_context():
        headers = {"Authorization": f"Bearer {create_access_token(identity=str(uid))}"}
    res = client.post(
        f"/api/app/class_instance?model=Lesson&id={lesson_id}&date={tomorrow.isoformat()}",
        headers=headers,
    )
    assert res.status_code == 200
    body = res.get_json()
    for key in ("cancellationDeadline", "cancellationDeadlineHours", "proactiveDeclineDeadline", "canDeclineProactively"):
        assert key in body, key
    assert body["cancellationDeadlineHours"] == 24
    assert body["cancellationDeadline"].startswith(tomorrow.isoformat()[:10]) or body["cancellationDeadline"] is not None
    assert body["presences"] == []
    assert len(body["participants"]) == 1
    # Still virtual: reading never materialises.
    assert _instances(app, lesson_id) == []


# ── criterion: ten days ahead on a recurring class → proactive, vacancy held ──

def _recurring_roster_class(app, ids, first_day, *, roster):
    """A weekly class starting on ``first_day`` 10:00 with ``roster`` enrolled at
    the series level, the coach assigned, no instance rows."""
    import json

    from padel_app.models import Association_CoachLesson, Association_PlayerLesson, Club
    from padel_app.models.lessons import Lesson

    with app.app_context():
        lesson = Lesson(
            title="Weekly", start_datetime=datetime.combine(first_day, time(10, 0)),
            end_datetime=datetime.combine(first_day, time(11, 0)), is_recurring=True,
            # calendar_tools.build_rrule: "frequency" + "daysOfWeek" (0 = Sunday, as PAD-85's fixture uses)
            recurrence_rule=json.dumps({"frequency": "weekly", "daysOfWeek": [(first_day.weekday() + 1) % 7]}),
            recurrence_end=first_day + timedelta(days=60),
            type="academy", max_players=4, color="#000", status="active",
            club_id=Club.query.first().id,
        )
        db.session.add(lesson)
        db.session.flush()
        db.session.add(Association_CoachLesson(coach_id=ids["coach_id"], lesson_id=lesson.id))
        for pid in roster:
            db.session.add(Association_PlayerLesson(player_id=pid, lesson_id=lesson.id))
        db.session.commit()
        return lesson.id


def test_cancel_ten_days_out_is_proactive_and_holds_invitations(app):
    from padel_app.models import LessonInstance, NotificationEvent, Presence, Vacancy
    from padel_app.services.notification_service import cancel_attendance, get_or_create_config
    from padel_app.tests.test_pad128_eligibility import _add_student

    ids = _setup(app)
    with app.app_context():
        bob = _add_student(ids["coach_id"], "bob", level_id=ids["level_ids"]["5"])
        db.session.commit()
        get_or_create_config(ids["coach_id"])  # defaults: reminder 48h, invitations 24h before
        day = club_now_naive().date() + timedelta(days=10)
    lesson_id = _recurring_roster_class(app, ids, day, roster=[ids["player_id"], bob])
    uid = _student_user_id(app, ids["player_id"])

    with app.app_context():
        with patch(PATCHES[0]), patch(PATCHES[1]):
            result = cancel_attendance(
                uid, model="Lesson", original_id=lesson_id, date=day.isoformat()
            )
        assert result == {"action": "declined", "proactive": True}
        instance = LessonInstance.query.filter_by(lesson_id=lesson_id).one()
        assert {p.player_id for p in instance.presences} == {ids["player_id"], bob}
        mine = Presence.query.filter_by(lesson_instance_id=instance.id, player_id=ids["player_id"]).one()
        assert mine.response == "proactive_decline" and mine.recorded_by == "student"  # PAD-271 M5
        from padel_app.serializers.presence import serialize_presence
        assert serialize_presence(mine)["lateCancellation"] is False
        vacancy = Vacancy.query.filter_by(lesson_instance_id=instance.id, original_player_id=ids["player_id"]).one()
        assert vacancy.status == "open"
        assert vacancy.invite_not_before is not None
        assert NotificationEvent.query.filter_by(lesson_instance_id=instance.id).count() == 0


# ── criterion: off the roster → 403 and nothing created ──

def test_a_student_off_the_roster_cannot_materialise_by_cancelling(app):
    from padel_app.models import LessonInstance, Presence, Vacancy
    from padel_app.services.notification_service import cancel_attendance
    from padel_app.tests.test_pad128_eligibility import _add_student

    ids = _setup(app)
    with app.app_context():
        stranger = _add_student(ids["coach_id"], "stranger", level_id=ids["level_ids"]["5"])
        db.session.commit()
        day = club_now_naive().date() + timedelta(days=10)
    lesson_id = _recurring_roster_class(app, ids, day, roster=[ids["player_id"]])
    stranger_uid = _student_user_id(app, stranger)

    with app.app_context():
        with pytest.raises(HTTPException) as exc, patch(PATCHES[0]), patch(PATCHES[1]):
            cancel_attendance(stranger_uid, model="Lesson", original_id=lesson_id, date=day.isoformat())
        assert exc.value.code == 403
        assert LessonInstance.query.filter_by(lesson_id=lesson_id).count() == 0
        assert Presence.query.filter_by(player_id=stranger).count() == 0
        assert Vacancy.query.count() == 0


# ── criterion: a date the recurrence does not produce → 404, nothing materialised ──

def test_a_date_outside_the_recurrence_is_refused(app):
    from padel_app.models import LessonInstance
    from padel_app.services.notification_service import cancel_attendance

    ids = _setup(app)
    with app.app_context():
        day = club_now_naive().date() + timedelta(days=10)
    lesson_id = _recurring_roster_class(app, ids, day, roster=[ids["player_id"]])
    uid = _student_user_id(app, ids["player_id"])

    with app.app_context():
        with pytest.raises(HTTPException) as exc, patch(PATCHES[0]), patch(PATCHES[1]):
            cancel_attendance(
                uid, model="Lesson", original_id=lesson_id, date=(day + timedelta(days=1)).isoformat()
            )
        assert exc.value.code == 404
        assert LessonInstance.query.filter_by(lesson_id=lesson_id).count() == 0
