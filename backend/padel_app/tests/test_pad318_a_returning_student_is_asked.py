"""PAD-318: a student the coach puts back is asked whether they are coming.

`send_class_reminders` skips anyone whose reminder-attempt count has reached the
coach's `reminderCount`, and a student who cancelled consumed theirs before doing
so. Nothing re-armed, so a re-added student sat at `planned` for ever: the coach
saw no answer and had no signal to go and ask.

The cap now counts the seat they hold NOW — a return voids the earlier round,
which also retires its bubbles, because an un-actioned Yes/No about a seat they
had given up must not stay tappable (PAD-49, PAD-94).
"""
from unittest.mock import patch

from padel_app.sql_db import db
from padel_app.tests.test_notification_reminder_flow import (
    PATCHES, _seed_coach_and_student, _seed_instance,
)


def _world(app, hours=48):
    ids = _seed_coach_and_student(app)
    return ids, _seed_instance(app, ids["coach_id"], ids["student_id"], start_offset_hours=hours)


def _state(app, iid, player_id):
    from padel_app.models.presences import Presence

    with app.app_context():
        row = Presence.query.filter_by(lesson_instance_id=iid, player_id=player_id).one()
        return row.attendance_state


def test_a_re_added_student_is_asked_again(app):
    from padel_app.models import LessonInstance
    from padel_app.services.lesson_service import enrol
    from padel_app.services.notification_service import (
        cancel_attendance, respond_to_reminder, send_class_reminders,
    )

    ids, iid = _world(app)
    with app.app_context():
        with patch(PATCHES[0]), patch(PATCHES[1]):
            assert send_class_reminders(iid)["sent"] == 1
            respond_to_reminder(iid, "yes", ids["student_user_id"])
            cancel_attendance(ids["student_user_id"], lesson_instance_id=iid)
            # before the fix this second pass sent 0 and never sent again
            enrol(ids["student_id"], db.session.get(LessonInstance, iid), "coach")
            assert send_class_reminders(iid)["sent"] == 1, (
                "the coach put them back, so they are asked about the seat they now hold"
            )
    assert _state(app, iid, ids["student_id"]) == "planned"


def test_the_old_bubble_is_retired_so_it_cannot_be_answered(app):
    """PAD-49/94: an un-actioned Yes/No about a seat they gave up must not stay live."""
    from padel_app.models import LessonInstance, ReminderAttempt
    from padel_app.services.lesson_service import enrol
    from padel_app.services.notification_service import cancel_attendance, send_class_reminders

    ids, iid = _world(app)
    with app.app_context():
        with patch(PATCHES[0]), patch(PATCHES[1]):
            send_class_reminders(iid)
            first = ReminderAttempt.query.filter_by(
                lesson_instance_id=iid, player_id=ids["student_id"]).one()
            first_id = first.id
            cancel_attendance(ids["student_user_id"], lesson_instance_id=iid)
            enrol(ids["student_id"], db.session.get(LessonInstance, iid), "coach")

        voided = db.session.get(ReminderAttempt, first_id)
        assert voided.superseded and voided.expired, "the earlier round is void"


def test_the_coach_is_not_told_a_reminder_is_outstanding_for_a_voided_round(app):
    """The class sheet must not show "reminder sent" for a student about to be
    asked for the first time about the seat they now hold (raised by Session J)."""
    from padel_app.models import LessonInstance
    from padel_app.models.presences import Presence
    from padel_app.serializers.presence import serialize_presences
    from padel_app.services.lesson_service import enrol
    from padel_app.services.notification_service import cancel_attendance, send_class_reminders

    ids, iid = _world(app)
    with app.app_context():
        with patch(PATCHES[0]), patch(PATCHES[1]):
            send_class_reminders(iid)
            row = Presence.query.filter_by(lesson_instance_id=iid,
                                           player_id=ids["student_id"]).one()
            assert serialize_presences([row])[0]["reminderSentAt"] is not None

            cancel_attendance(ids["student_user_id"], lesson_instance_id=iid)
            enrol(ids["student_id"], db.session.get(LessonInstance, iid), "coach")

        row = Presence.query.filter_by(lesson_instance_id=iid,
                                       player_id=ids["student_id"]).one()
        assert serialize_presences([row])[0]["reminderSentAt"] is None


def test_a_student_added_inside_the_reminder_window_is_still_asked(app):
    """The case a reviewer assumes is fine, and it is not.

    A fresh add is only "working" because a reminder happens to arrive afterwards.
    Add someone AFTER the pass has run for that class and nothing asks them — no
    cancellation anywhere in the story. The cap counts their own attempts, so a
    newcomer starts at zero and the next pass picks them up.
    """
    from padel_app.models import LessonInstance
    from padel_app.services.lesson_service import enrol
    from padel_app.services.notification_service import send_class_reminders
    from padel_app.tests.test_pad259_readers import _second_student

    ids, iid = _world(app)
    with app.app_context():
        with patch(PATCHES[0]), patch(PATCHES[1]):
            send_class_reminders(iid)  # the round runs before the newcomer exists
            carol, _uid = _second_student(app, ids["coach_id"], "carol")
            enrol(carol, db.session.get(LessonInstance, iid), "coach")
            assert send_class_reminders(iid)["sent"] == 1, (
                "a student added after the pass is still asked; they have had no "
                "reminder of their own"
            )


def test_the_cap_still_holds_for_an_ordinary_student(app):
    """The guard against over-correcting: reminders are still capped.

    Every new reminder supersedes the previous one (PAD-49), so a cap that
    ignored `superseded` alone would uncap reminders entirely.
    """
    from padel_app.services.notification_service import send_class_reminders

    ids, iid = _world(app)
    with app.app_context():
        with patch(PATCHES[0]), patch(PATCHES[1]):
            assert send_class_reminders(iid)["sent"] == 1
            assert send_class_reminders(iid)["sent"] == 0, "reminderCount is 1"
            assert send_class_reminders(iid)["sent"] == 0
