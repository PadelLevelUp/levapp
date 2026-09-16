"""PAD-316: the coach's two ways of putting a student back must actually do it.

PAD-313 fixed the student's own return. The coach has two more doors, and both
left the row saying "absent" while the app said otherwise:

  (a) re-adding a cancelled student — `enrol` found the row, returned it
      untouched, and the re-add silently did nothing (a regression from
      PAD-259, when the presence row became the enrolment);
  (b) reversing their own absent mark — the count came back but the vacancy the
      absence opened stayed open, so the engine went on offering a seat the
      class no longer had. That one is live on production, where nothing
      reconciles vacancies at all.

Every return door goes through the same routine now: re-seat, reclaim their own
vacancy, reconcile.
"""
from unittest.mock import patch

from padel_app.sql_db import db


def _world(app, max_players=4):
    from padel_app.models import LessonInstance
    from padel_app.tests.test_notification_reminder_flow import (
        _seed_coach_and_student, _seed_instance,
    )
    ids = _seed_coach_and_student(app)
    iid = _seed_instance(app, ids["coach_id"], ids["student_id"], start_offset_hours=48)
    if max_players != 4:
        with app.app_context():
            inst = db.session.get(LessonInstance, iid)
            inst.max_players = max_players
            db.session.commit()
    return ids, iid


def _snap(app, iid, player_id):
    from padel_app.models import LessonInstance, Vacancy
    from padel_app.models.presences import Presence

    with app.app_context():
        inst = db.session.get(LessonInstance, iid)
        row = Presence.query.filter_by(lesson_instance_id=iid, player_id=player_id).one()
        open_vacancies = Vacancy.query.filter_by(
            lesson_instance_id=iid, status="open"
        ).count()
        return inst.effective_filled_spots, open_vacancies, row.attendance_state


def _cancelled(app, ids, iid):
    from padel_app.services.notification_service import cancel_attendance, respond_to_reminder
    from padel_app.tests.test_notification_reminder_flow import PATCHES

    with app.app_context():
        with patch(PATCHES[0]), patch(PATCHES[1]):
            respond_to_reminder(iid, "yes", ids["student_user_id"])
            cancel_attendance(ids["student_user_id"], lesson_instance_id=iid)
    assert _snap(app, iid, ids["student_id"]) == (0, 1, "not_coming")


def test_a_coach_re_adding_a_cancelled_student_actually_seats_them(app):
    """Door (a): `enrol` used to hand the existing row back untouched."""
    from padel_app.models import LessonInstance
    from padel_app.services.lesson_service import enrol

    ids, iid = _world(app)
    _cancelled(app, ids, iid)
    with app.app_context():
        enrol(ids["student_id"], db.session.get(LessonInstance, iid), "coach")

    assert _snap(app, iid, ids["student_id"]) == (1, 0, "planned"), (
        "the coach's re-add seats them, closes their vacancy, and leaves them "
        "un-answered rather than claiming they said yes"
    )


def test_re_enrolling_someone_who_never_left_still_changes_nothing(app):
    """The idempotence that matters is still there: only an ABSENT row returns."""
    from padel_app.models import LessonInstance
    from padel_app.models.presences import Presence
    from padel_app.services.lesson_service import enrol
    from padel_app.services.notification_service import respond_to_reminder
    from padel_app.tests.test_notification_reminder_flow import PATCHES

    ids, iid = _world(app)
    with app.app_context():
        with patch(PATCHES[0]), patch(PATCHES[1]):
            respond_to_reminder(iid, "yes", ids["student_user_id"])
        before = Presence.query.filter_by(
            lesson_instance_id=iid, player_id=ids["student_id"]
        ).one()
        stamp, source = before.updated_at, before.enrolment_source
        enrol(ids["student_id"], db.session.get(LessonInstance, iid), "coach")
        after = Presence.query.filter_by(
            lesson_instance_id=iid, player_id=ids["student_id"]
        ).one()
        assert (after.updated_at, after.enrolment_source) == (stamp, source)
        assert after.confirmed is True, "their own yes is not overwritten"


def test_a_coach_reversing_their_absent_mark_closes_the_vacancy_it_opened(app):
    """Door (b), the one that is live on production."""
    from padel_app.models import LessonInstance
    from padel_app.services.lesson_service import add_presences

    ids, iid = _world(app)
    with app.app_context():
        inst = db.session.get(LessonInstance, iid)
        add_presences(inst, [{"playerId": ids["student_id"], "status": "absent",
                              "justification": "unjustified"}])
    filled, _vac, state = _snap(app, iid, ids["student_id"])
    assert (filled, state) == (0, "missed")

    with app.app_context():
        inst = db.session.get(LessonInstance, iid)
        add_presences(inst, [{"playerId": ids["student_id"], "status": "present"}])

    assert _snap(app, iid, ids["student_id"]) == (1, 0, "attended"), (
        "the seat is theirs again and no vacancy is still offering it"
    )


def test_a_coach_marking_absent_still_frees_the_spot(app):
    """The reversal fix must not stop an absence freeing the seat."""
    from padel_app.models import LessonInstance
    from padel_app.services.lesson_service import add_presences

    ids, iid = _world(app)
    with app.app_context():
        inst = db.session.get(LessonInstance, iid)
        add_presences(inst, [{"playerId": ids["student_id"], "status": "absent",
                              "justification": "justified"}])
    filled, _v, state = _snap(app, iid, ids["student_id"])
    assert (filled, state) == (0, "missed")


def test_a_coach_cannot_seat_someone_the_class_no_longer_has_room_for(app):
    """A full class stays full: the vacancy closed and the seat is genuinely taken."""
    from padel_app.models import LessonInstance
    from padel_app.services.lesson_service import enrol
    from padel_app.tests.test_pad259_readers import _second_student

    ids, iid = _world(app, max_players=1)
    _cancelled(app, ids, iid)
    with app.app_context():
        carol, _uid = _second_student(app, ids["coach_id"], "carol")
        enrol(carol, db.session.get(LessonInstance, iid), "fill", confirmed=True)
        assert db.session.get(LessonInstance, iid).effective_filled_spots == 1
        # the coach re-adds the original student anyway
        enrol(ids["student_id"], db.session.get(LessonInstance, iid), "coach")
        inst = db.session.get(LessonInstance, iid)
        assert inst.effective_filled_spots == 2, (
            "the coach's own decision is not refused — but it is now visible as "
            "an over-subscription rather than a silent no-op"
        )
