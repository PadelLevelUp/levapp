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


def test_confirm_cancel_reconfirm_cancel_keeps_the_seat_and_the_badge_in_step(app):
    """B-073's other direction, end to end.

    A yes after a cancellation used to leave `status='absent'`: the app said
    "confirmed" while the class did not count the student and the engine was
    still offering their spot away. The badge and the seat must move together.
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

            # Re-confirming re-seats them: the spot was still open.
            assert respond_to_reminder(iid, "yes", ids["student_user_id"])["action"] == "confirmed"
            assert _seat(app, iid, ids["student_id"]) == (1, 0, "coming"), (
                "a re-confirmed student is counted again and their vacancy is closed"
            )

            # And cancelling again still works.
            cancel_attendance(ids["student_user_id"], lesson_instance_id=iid)
            filled, _vacancies, state = _seat(app, iid, ids["student_id"])
            assert (filled, state) == (0, "not_coming")


def test_a_reconfirm_is_refused_when_the_spot_is_gone_and_the_student_is_told(app):
    """PAD-261's one winner: re-taking a seat someone else now holds would put
    two students in one place, so it is refused — out loud."""
    from unittest.mock import patch

    from padel_app.models import Message
    from padel_app.services.lesson_service import enrol
    from padel_app.models import LessonInstance
    from padel_app.services.notification_service import cancel_attendance, respond_to_reminder
    from padel_app.tests.test_notification_reminder_flow import PATCHES
    from padel_app.tests.test_pad259_readers import _second_student

    ids, iid = _world(app, max_players=1)
    with app.app_context():
        with patch(PATCHES[0]), patch(PATCHES[1]):
            respond_to_reminder(iid, "yes", ids["student_user_id"])
            cancel_attendance(ids["student_user_id"], lesson_instance_id=iid)
            assert _seat(app, iid, ids["student_id"])[0] == 0

            # somebody else takes the freed seat
            carol, _carol_uid = _second_student(app, ids["coach_id"], "carol")
            inst = db.session.get(LessonInstance, iid)
            enrol(carol, inst, "fill", confirmed=True)
            assert db.session.get(LessonInstance, iid).effective_filled_spots == 1

            before = Message.query.count()
            result = respond_to_reminder(iid, "yes", ids["student_user_id"])

    assert result["action"] == "spot_filled"
    filled, _v, state = _seat(app, iid, ids["student_id"])
    assert filled == 1, "the class is not over-filled"
    assert state == "not_coming", "the refused student is not shown as coming"
    with app.app_context():
        assert Message.query.count() > before, "the student is told, not silently ignored"
        # and the coach, who is the only one who can put them back by hand
        coach_told = Message.query.filter(
            Message.msg_metadata["returnRefused"].as_boolean().is_(True)
        ).count() if db.engine.name == "postgresql" else sum(
            1 for m in Message.query.all()
            if (m.msg_metadata or {}).get("returnRefused") is True
        )
        assert coach_told == 1, "the coach is told the student tried to come back"


def test_a_refused_return_is_not_recorded_as_a_yes(app):
    """A student refused a seat must not be on record as having accepted it.

    The reminder was marked answered before the capacity check, and the
    refusal's commit persisted it — so the bubble would tell them their "yes"
    was taken while the server had just refused it.
    """
    from unittest.mock import patch

    from padel_app.models import LessonInstance, ReminderAttempt
    from padel_app.services.lesson_service import enrol
    from padel_app.services.notification_service import (
        cancel_attendance, respond_to_reminder, send_class_reminders,
    )
    from padel_app.tests.test_notification_reminder_flow import PATCHES
    from padel_app.tests.test_pad259_readers import _second_student

    ids, iid = _world(app, max_players=1)
    with app.app_context():
        with patch(PATCHES[0]), patch(PATCHES[1]):
            send_class_reminders(iid)
            cancel_attendance(ids["student_user_id"], lesson_instance_id=iid)

            carol, _uid = _second_student(app, ids["coach_id"], "carol")
            enrol(carol, db.session.get(LessonInstance, iid), "fill", confirmed=True)

            assert respond_to_reminder(iid, "yes", ids["student_user_id"])["action"] == "spot_filled"

        attempt = (
            ReminderAttempt.query
            .filter_by(lesson_instance_id=iid, player_id=ids["student_id"])
            .order_by(ReminderAttempt.id.desc())
            .first()
        )
        assert attempt is not None, "the reminder that was sent has an attempt row"
        assert attempt.response != "yes", (
            "a refused student must not be recorded as having accepted"
        )
