"""Batch-2 audit (Session A): the re-accept ("retaking") lock in
respond_to_reminder still read the copied ``instance.max_players`` while every
sibling capacity check moved to ``effective_max_players`` (PAD-275,
classes.edit rule 4: the override, else the lesson's capacity, never the
copy). They diverge when the LESSON's capacity is edited after the
occurrence materialised and no override exists: the calendar and the
student see a free spot, the lock refuses them as full.
"""
from unittest.mock import patch

from padel_app.sql_db import db


def _world_with_stale_copy(app):
    """An occurrence materialised when the lesson held 1, whose lesson was
    then widened to 2 with no per-occurrence override."""
    from padel_app.models import LessonInstance
    from padel_app.tests.test_pad313_attendance_state import _world

    ids, iid = _world(app)
    with app.app_context():
        inst = db.session.get(LessonInstance, iid)
        inst.max_players = 1                 # the copy taken at materialisation
        inst.max_players_override = None     # no override: the lesson's capacity rules
        inst.lesson.max_players = 2          # the coach widened the class afterwards
        db.session.commit()
        assert db.session.get(LessonInstance, iid).effective_max_players == 2
    return ids, iid


def test_a_return_is_allowed_when_the_lesson_was_widened_after_materialisation(app):
    from padel_app.models import LessonInstance
    from padel_app.services.lesson_service import enrol
    from padel_app.services.notification_service import cancel_attendance, respond_to_reminder
    from padel_app.tests.test_notification_reminder_flow import PATCHES
    from padel_app.tests.test_pad259_readers import _second_student
    from padel_app.tests.test_pad313_attendance_state import _seat

    ids, iid = _world_with_stale_copy(app)
    with app.app_context():
        with patch(PATCHES[0]), patch(PATCHES[1]):
            respond_to_reminder(iid, "yes", ids["student_user_id"])
            cancel_attendance(ids["student_user_id"], lesson_instance_id=iid)
            carol, _ = _second_student(app, ids["coach_id"], "carol")
            enrol(carol, db.session.get(LessonInstance, iid), "fill", confirmed=True)
            assert db.session.get(LessonInstance, iid).effective_filled_spots == 1
            # One of two seats is free by every other reader's arithmetic.
            result = respond_to_reminder(iid, "yes", ids["student_user_id"])

    assert result["action"] == "confirmed", result
    filled, _v, state = _seat(app, iid, ids["student_id"])
    assert filled == 2 and state == "coming"


def test_a_return_is_still_refused_when_the_effective_capacity_is_full(app):
    """The other direction: an override of 1 (the copy says 4) keeps refusing."""
    from padel_app.models import LessonInstance
    from padel_app.services.lesson_service import enrol
    from padel_app.services.notification_service import cancel_attendance, respond_to_reminder
    from padel_app.tests.test_notification_reminder_flow import PATCHES
    from padel_app.tests.test_pad259_readers import _second_student
    from padel_app.tests.test_pad313_attendance_state import _seat, _world

    ids, iid = _world(app)
    with app.app_context():
        inst = db.session.get(LessonInstance, iid)
        inst.max_players = 4
        inst.max_players_override = 1
        db.session.commit()
        with patch(PATCHES[0]), patch(PATCHES[1]):
            respond_to_reminder(iid, "yes", ids["student_user_id"])
            cancel_attendance(ids["student_user_id"], lesson_instance_id=iid)
            carol, _ = _second_student(app, ids["coach_id"], "carol")
            enrol(carol, db.session.get(LessonInstance, iid), "fill", confirmed=True)
            result = respond_to_reminder(iid, "yes", ids["student_user_id"])

    assert result["action"] == "spot_filled", result
    assert _seat(app, iid, ids["student_id"])[0] == 1
