"""PAD-313 (attendance.presence rule 9, ledger B-073): one derived state a human can read.

A founder on TestFlight 20 saw "presença confirmada", "falta justificada" and
"ausente" at once after cancelling. Two of those were faithful; the third was
not. A decline writes ``confirmed = True`` — rule 2's flag means *answered*,
not *coming* — so any derivation that tests ``confirmed`` first reports a
student who just cancelled as confirmed.
"""
import pytest

from padel_app.sql_db import db


def _row(**flags):
    """A Presence in a given shape, unsaved — the state is pure."""
    from padel_app.models.presences import Presence

    base = dict(lesson_instance_id=1, player_id=1, invited=True, confirmed=False,
                status=None, justification=None, validated=False)
    base.update(flags)
    return Presence(**base)


# --- the five states, on the model -----------------------------------------

def test_on_the_list_and_silent_is_planned(app):
    with app.app_context():
        assert _row().attendance_state == "planned"


def test_answered_yes_is_coming(app):
    with app.app_context():
        assert _row(confirmed=True).attendance_state == "coming"


def test_a_cancellation_is_not_coming_never_coming(app):
    """The defect B-073 records: the decline shape also carries confirmed=True."""
    with app.app_context():
        cancelled = _row(confirmed=True, status="absent", justification="justified")
        assert cancelled.attendance_state == "not_coming"


def test_the_coach_validating_present_is_attended(app):
    with app.app_context():
        assert _row(confirmed=True, status="present", validated=True).attendance_state == "attended"


def test_an_unvalidated_absence_is_not_coming_whatever_its_justification(app):
    """`missed` asserts a coach's record; an unvalidated row has none, so the
    justification column does not change the state (agreed with Session J,
    2026-09-12 — two derivations that disagree is how the first bug survived)."""
    with app.app_context():
        assert _row(status="absent", justification="justified").attendance_state == "not_coming"
        assert _row(status="absent", justification="unjustified").attendance_state == "not_coming"
        assert _row(status="absent").attendance_state == "not_coming"


def test_the_coach_validating_absent_is_missed(app):
    with app.app_context():
        row = _row(confirmed=True, status="absent", justification="unjustified", validated=True)
        assert row.attendance_state == "missed"


def test_a_cancellation_the_coach_then_validated_reports_the_coach(app):
    """Once validated, the coach's record replaces the student's intent."""
    with app.app_context():
        row = _row(confirmed=True, status="absent", justification="justified", validated=True)
        assert row.attendance_state == "missed"


def test_validated_with_no_status_falls_back_to_intent(app):
    """Decided 2026-09-12: never invent an absence the coach did not state."""
    with app.app_context():
        assert _row(confirmed=True, validated=True).attendance_state == "coming"
        assert _row(validated=True).attendance_state == "planned"


# --- both surfaces serve it ------------------------------------------------

def test_the_class_detail_payload_carries_it(app):
    from padel_app.serializers.presence import serialize_presence

    with app.app_context():
        row = _row(confirmed=True, status="absent", justification="justified")
        assert serialize_presence(row)["attendanceState"] == "not_coming"


def test_the_presences_rows_agree_with_the_class_detail(app):
    """One computation, not two: the validation tab cannot disagree with the sheet."""
    from padel_app.serializers.presence import serialize_presence
    from padel_app.services.presence_overview_service import _response_state

    with app.app_context():
        cancelled = _row(confirmed=True, status="absent", justification="justified")
        assert serialize_presence(cancelled)["attendanceState"] == "not_coming"
        # the overview's own RSVP field must no longer call a cancellation "confirmed"
        assert _response_state(cancelled) == "declined"


def test_a_real_cancellation_through_the_service_reports_not_coming(app):
    """End to end, not a hand-built row: the path the founder actually took."""
    from padel_app.models.presences import Presence
    from padel_app.serializers.presence import serialize_presence
    from padel_app.services.notification_service import cancel_attendance
    from padel_app.tests.test_notification_reminder_flow import (
        _seed_coach_and_student,
        _seed_instance,
    )

    ids = _seed_coach_and_student(app)
    instance_id = _seed_instance(app, ids["coach_id"], ids["student_id"], start_offset_hours=48)
    with app.app_context():
        cancel_attendance(ids["student_user_id"], lesson_instance_id=instance_id)
        row = Presence.query.filter_by(lesson_instance_id=instance_id,
                                       player_id=ids["student_id"]).one()
        assert serialize_presence(row)["attendanceState"] == "not_coming"


# --- the journey, through the real endpoints -------------------------------

def _world(app, max_players=4):
    from padel_app.tests.test_notification_reminder_flow import (
        _seed_coach_and_student, _seed_instance,
    )
    ids = _seed_coach_and_student(app)
    iid = _seed_instance(app, ids["coach_id"], ids["student_id"], start_offset_hours=48)
    if max_players != 4:
        from padel_app.models import LessonInstance
        with app.app_context():
            inst = db.session.get(LessonInstance, iid)
            inst.max_players = max_players
            inst.max_players_override = max_players if hasattr(inst, "max_players_override") else None
            db.session.commit()
    return ids, iid


def _seat(app, iid, player_id):
    """What the class and the row say: (filled, open vacancies, state)."""
    from padel_app.models import LessonInstance, Vacancy
    from padel_app.models.presences import Presence

    with app.app_context():
        inst = db.session.get(LessonInstance, iid)
        row = Presence.query.filter_by(lesson_instance_id=iid, player_id=player_id).one()
        open_vacancies = Vacancy.query.filter_by(
            lesson_instance_id=iid, status="open"
        ).count()
        return inst.effective_filled_spots, open_vacancies, row.attendance_state


def test_confirm_then_cancel_is_final_the_seat_and_the_badge_stay_given_up(app):
    """B-073's other direction, end to end — and PAD-570 (attendance.confirm rule 28):
    "Não vou" is final. A yes after a cancellation used to re-seat the student when
    the spot was still free (PAD-315); now it is refused with `already_declined`, records
    nothing, and the seat and the badge stay in step: 0 counted, `not_coming`, the
    vacancy still open for somebody else.
    """
    from unittest.mock import patch

    from padel_app.services.notification_service import cancel_attendance, respond_to_reminder
    from padel_app.tests.test_notification_reminder_flow import PATCHES

    ids, iid = _world(app)
    with app.app_context():
        with patch(PATCHES[0]), patch(PATCHES[1]):
            respond_to_reminder(iid, "yes", ids["student_user_id"])
            assert _seat(app, iid, ids["student_id"]) == (1, 0, "coming")

            cancel_attendance(ids["student_user_id"], lesson_instance_id=iid)
            filled, vacancies, state = _seat(app, iid, ids["student_id"])
            assert (filled, state) == (0, "not_coming")
            assert vacancies == 1, "the cancelled spot is offered to someone else"

            # PAD-570: there is no way back; the server refuses and touches nothing.
            assert respond_to_reminder(iid, "yes", ids["student_user_id"]) == {"action": "already_declined"}
            assert _seat(app, iid, ids["student_id"]) == (0, 1, "not_coming"), (
                "a refused student is not counted, not shown as coming, and their vacancy stays open"
            )
