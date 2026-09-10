"""notifications.reminders rule 14 (PAD-207, audit M6) — reminder state has its
own table and every "pending reminder" read goes through it; messages stay the
delivery record and their metadata mirrors the row (no behaviour change).

Fixtures are the reminder-flow ones (same seed, same IO patches).
"""
from datetime import datetime, timedelta
from unittest.mock import patch

from padel_app.sql_db import db
from padel_app.tests.test_notification_reminder_flow import (
    PATCHES,
    _config_with_repeat,
    _seed_coach_and_student,
    _seed_instance,
)


def _send(instance_id, now):
    from padel_app.services.notification_service import send_class_reminders

    with patch(PATCHES[0]), patch(PATCHES[1]):
        return send_class_reminders(instance_id, now=now)


def test_each_reminder_is_one_attempt_row_and_the_message_mirrors_it(app):
    from padel_app.models import Message, ReminderAttempt

    ids = _seed_coach_and_student(app)
    instance_id = _seed_instance(app, ids["coach_id"], ids["student_id"], start_offset_hours=48)
    # Two reminders, one hour apart.
    _config_with_repeat(app, ids["coach_id"], count=2, hours=1)
    with app.app_context():
        now = datetime.utcnow()
        _send(instance_id, now=now)
        _send(instance_id, now=now + timedelta(hours=1))

        rows = (
            ReminderAttempt.query.filter_by(lesson_instance_id=instance_id, player_id=ids["student_id"])
            .order_by(ReminderAttempt.number)
            .all()
        )
        assert [r.number for r in rows] == [1, 2]
        assert rows[0].superseded is True and rows[0].responded_at is None
        assert rows[1].superseded is False and rows[1].responded_at is None
        assert rows[0].presence_id is not None
        for r in rows:
            msg = Message.query.get(r.message_id)
            assert msg is not None and msg.message_type == "notification_reminder"
            assert msg.msg_metadata.get("reminderNumber") == r.number
            assert bool(msg.msg_metadata.get("superseded")) is r.superseded


def test_answering_marks_the_attempt_and_the_message(app):
    from padel_app.models import Message, ReminderAttempt
    from padel_app.services.notification_service import respond_to_reminder

    ids = _seed_coach_and_student(app)
    instance_id = _seed_instance(app, ids["coach_id"], ids["student_id"], start_offset_hours=48)
    with app.app_context():
        _send(instance_id, now=datetime.utcnow())
        with patch(PATCHES[0]), patch(PATCHES[1]):
            result = respond_to_reminder(instance_id, "yes", ids["student_user_id"])
        assert result.get("duplicate") is not True
        row = ReminderAttempt.query.filter_by(lesson_instance_id=instance_id, player_id=ids["student_id"]).one()
        assert row.responded_at is not None
        assert row.response == "yes"
        msg = Message.query.get(row.message_id)
        assert msg.msg_metadata.get("responded") is True
        assert msg.msg_metadata.get("response") == "yes"


def test_expiring_marks_the_attempt_superseded_and_expired(app):
    from padel_app.models import LessonInstance, Message, ReminderAttempt
    from padel_app.services.notification_service import _expire_stale_reminders

    ids = _seed_coach_and_student(app)
    instance_id = _seed_instance(app, ids["coach_id"], ids["student_id"], start_offset_hours=48)
    with app.app_context():
        _send(instance_id, now=datetime.utcnow())
        with patch(PATCHES[0]), patch(PATCHES[1]):
            _expire_stale_reminders(LessonInstance.query.get(instance_id), ids["student_user_id"])
        row = ReminderAttempt.query.filter_by(lesson_instance_id=instance_id, player_id=ids["student_id"]).one()
        assert row.superseded is True and row.expired is True and row.responded_at is None
        msg = Message.query.get(row.message_id)
        assert msg.msg_metadata.get("superseded") is True and msg.msg_metadata.get("expired") is True


def test_the_table_not_the_metadata_decides_what_is_pending(app):
    from padel_app.models import Message, ReminderAttempt
    from padel_app.services.notification_service import _pending_reminder_message

    ids = _seed_coach_and_student(app)
    instance_id = _seed_instance(app, ids["coach_id"], ids["student_id"], start_offset_hours=48)
    with app.app_context():
        _send(instance_id, now=datetime.utcnow())
        pending = _pending_reminder_message(ids["coach_user_id"], ids["student_user_id"], instance_id)
        assert pending is not None
        row = ReminderAttempt.query.filter_by(lesson_instance_id=instance_id, player_id=ids["student_id"]).one()
        assert pending.id == row.message_id

        # Disagreement: the row says answered, the metadata still says pending.
        row.responded_at = datetime.utcnow()
        row.response = "no"
        db.session.commit()
        msg = Message.query.get(row.message_id)
        assert not msg.msg_metadata.get("responded")
        assert _pending_reminder_message(ids["coach_user_id"], ids["student_user_id"], instance_id) is None


def test_the_reminder_count_reads_the_table(app):
    from padel_app.models import Message, ReminderAttempt

    ids = _seed_coach_and_student(app)
    instance_id = _seed_instance(app, ids["coach_id"], ids["student_id"], start_offset_hours=48)
    with app.app_context():
        _send(instance_id, now=datetime.utcnow())
        # A stray reminder MESSAGE with no row must not count against the limit,
        # and a row must count even if its message metadata were lost.
        assert ReminderAttempt.query.count() == 1
        first = ReminderAttempt.query.one()
        msg = Message.query.get(first.message_id)
        msg.msg_metadata = {}
        db.session.commit()
        _send(instance_id, now=datetime.utcnow() + timedelta(hours=1))
        rows = ReminderAttempt.query.filter_by(lesson_instance_id=instance_id).order_by(ReminderAttempt.number).all()
        # The default config sends ONE reminder per instance; the second send is
        # refused because the table says one was already sent.
        assert [r.number for r in rows] == [1]


def test_migration_is_guarded_and_backfills_from_metadata():
    import importlib.util
    import pathlib

    versions = pathlib.Path(__file__).resolve().parents[2] / "migrations" / "versions"
    matches = list(versions.glob("*pad207_reminder_attempts*.py"))
    assert len(matches) == 1, matches
    src = matches[0].read_text()
    assert "has_table" in src and "reminder_attempts" in src
    assert "NOT IN (SELECT message_id FROM reminder_attempts" in src or "already" in src
    spec = importlib.util.spec_from_file_location("pad207_mig", matches[0])
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    assert mod.down_revision == "ad97ec649746"
    row = mod.attempt_from_metadata(
        {"lessonInstanceId": 10, "reminderNumber": 2, "responded": True, "response": "no", "superseded": False},
        sent_at=datetime(2026, 9, 1, 10, 0),
    )
    assert row == dict(
        lesson_instance_id=10, number=2, responded_at=datetime(2026, 9, 1, 10, 0), response="no", superseded=False, expired=False
    )
    assert mod.attempt_from_metadata({"instanceId": 7, "superseded": True, "expired": True}, sent_at=None)["lesson_instance_id"] == 7
    assert mod.attempt_from_metadata({}, sent_at=None) is None
