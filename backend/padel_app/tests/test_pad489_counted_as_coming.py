"""PAD-489 (notifications.reminders rule 22; owner, 2026-10-03): a class created after its
reminder time has already passed counts its students as coming, without asking them.

Before: creating such a class wrote no occurrence and armed nothing, so the student was never
asked by anything until something else materialised the occurrence, and then rule 18 asked them
at once. Now the occurrence exists at creation, the presence is answered yes by the system, and
the student is told they are counted as coming. Only a class CREATED late: a student added late
to an existing class keeps rule 18 (asked), as does a student who cancelled and is put back.

Real clock, starts relative to now; real scheduler (conftest `live_scheduler`).
"""
from datetime import datetime, timedelta
from unittest.mock import patch

import pytest

from padel_app.sql_db import db
from padel_app.tests.test_notification_reminder_flow import _seed_coach_and_student
from padel_app.tests.test_pad330_the_student_is_told import _added_messages, _club
from padel_app.utils.dates import utc_to_wall_naive, utcnow_naive

pytestmark = pytest.mark.usefixtures("no_test_may_hang")

QUIET = (
    "padel_app.services.notification_service.publish",
    "padel_app.services.notification_service.send_push_notification",
)


def _create(app, ids, club_id, *, hours_ahead, recurring=False, player_ids=None, notify_students=True, title="Late class"):
    """The coach's "Add class", through add_class_service, `hours_ahead` from now."""
    from padel_app.models import Club, Coach
    from padel_app.services.lesson_service import add_class_service

    with app.app_context():
        start = utc_to_wall_naive(utcnow_naive()) + timedelta(hours=hours_ahead)
        start = start.replace(second=0, microsecond=0)
        data = {
            "name": title, "classType": "academy", "maxPlayers": 4, "color": "#000",
            "date": start.date().isoformat(), "startTime": start.strftime("%H:%M"),
            "endTime": (start + timedelta(hours=1)).strftime("%H:%M"),
            "playerIds": [ids["student_id"]] if player_ids is None else list(player_ids),
        }
        if recurring:
            data.update({
                "isRecurring": True,
                "recurrenceRule": {"frequency": "weekly", "daysOfWeek": [(start.weekday() + 1) % 7]},
                "endDate": (start + timedelta(weeks=3)).date().isoformat(),
            })
        with patch(QUIET[0]), patch(QUIET[1]):
            lesson = add_class_service(data, db.session.get(Coach, ids["coach_id"]), db.session.get(Club, club_id),
                                       notify_students=notify_students)
            db.session.commit()
            return lesson.id


def _presences(app, lesson_id):
    from padel_app.models import LessonInstance
    from padel_app.models.presences import Presence

    with app.app_context():
        rows = []
        for inst in LessonInstance.query.filter_by(lesson_id=lesson_id).order_by(LessonInstance.start_datetime).all():
            for p in Presence.query.filter_by(lesson_instance_id=inst.id).all():
                rows.append({"instance": inst.id, "date": inst.start_datetime.date().isoformat(), "player": p.player_id,
                             "confirmed": p.confirmed, "response": p.response, "recorded_by": p.recorded_by,
                             "status": p.status, "validated": p.validated})
        return rows


def _ask_jobs(live_scheduler):
    return sorted(j.id for j in live_scheduler._scheduler.get_jobs() if j.id.startswith("ask_"))


def _world(app):
    ids = _seed_coach_and_student(app)
    return ids, _club(app)


# ── rule 22: created late → counted as coming ─────────────────────────────────

def test_a_class_created_six_hours_ahead_counts_its_student_as_coming(app, live_scheduler):
    ids, club_id = _world(app)

    lesson_id = _create(app, ids, club_id, hours_ahead=6)

    rows = _presences(app, lesson_id)
    assert len(rows) == 1, "the occurrence is materialised at creation and holds the student"
    row = rows[0]
    assert row["confirmed"] is True
    assert (row["response"], row["recorded_by"]) == ("confirmed", "system")
    assert row["status"] is None and row["validated"] is False, "coming is not present: validation is still the coach's"
    assert _ask_jobs(live_scheduler) == [], "nobody is asked"


def test_the_student_is_told_they_are_counted_as_coming(app, live_scheduler):
    ids, club_id = _world(app)

    _create(app, ids, club_id, hours_ahead=6, title="Treino de sexta")

    msgs = _added_messages(app, ids["student_user_id"])
    assert len(msgs) == 1, "told once"
    assert "Treino de sexta" in msgs[0].text
    assert "counted as coming" in msgs[0].text or "presença fica já confirmada" in msgs[0].text
    assert "?" not in msgs[0].text, "it carries no question"
    assert msgs[0].msg_metadata.get("countedAsComing") is True


def test_a_class_created_five_days_ahead_is_unchanged(app, live_scheduler):
    ids, club_id = _world(app)

    lesson_id = _create(app, ids, club_id, hours_ahead=5 * 24)

    assert _presences(app, lesson_id) == [], "no occurrence is materialised; the ordinary reminder will ask"
    msgs = _added_messages(app, ids["student_user_id"])
    assert len(msgs) == 1 and "counted as coming" not in msgs[0].text and "já confirmada" not in msgs[0].text
    jobs = [j.id for j in live_scheduler._scheduler.get_jobs()]
    assert any(j.startswith("reminder_lesson_") for j in jobs), "the ordinary reminder job is armed"


def test_a_series_created_late_counts_only_the_occurrences_already_past_their_reminder_time(app, live_scheduler):
    ids, club_id = _world(app)

    lesson_id = _create(app, ids, club_id, hours_ahead=20, recurring=True)

    rows = _presences(app, lesson_id)
    assert len(rows) == 1, "only tomorrow's occurrence is materialised; next week's keeps its reminder"
    assert rows[0]["response"] == "confirmed"
    jobs = [j.id for j in live_scheduler._scheduler.get_jobs()]
    assert any(j.startswith("reminder_lesson_") for j in jobs), "next week's ordinary reminder is armed"
    assert _ask_jobs(live_scheduler) == []


# ── what stays as it was ──────────────────────────────────────────────────────

def test_a_student_added_late_to_an_existing_class_is_still_asked(app, live_scheduler):
    """Rule 18 is untouched: only a class CREATED late counts as coming (owner's decision a)."""
    from padel_app.models import LessonInstance
    from padel_app.services.lesson_service import enrol
    from padel_app.tests.test_pad259_readers import _second_student

    ids, club_id = _world(app)
    lesson_id = _create(app, ids, club_id, hours_ahead=6)
    with app.app_context():
        inst = LessonInstance.query.filter_by(lesson_id=lesson_id).first()
        live_scheduler._scheduler.remove_all_jobs()
        carol, _uid = _second_student(app, ids["coach_id"], "carol")
        with patch(QUIET[0]), patch(QUIET[1]):
            enrol(carol, inst, "coach")
            db.session.commit()

    rows = [r for r in _presences(app, lesson_id) if r["player"] == carol]
    assert rows[0]["confirmed"] is False and rows[0]["response"] == "none"
    assert len(_ask_jobs(live_scheduler)) == 1, "a late ask is armed for the newcomer"


def test_a_student_who_cancelled_and_is_put_back_late_is_still_asked(app, live_scheduler):
    """Owner's decision c: PAD-318 stays."""
    from padel_app.models import LessonInstance
    from padel_app.services.lesson_service import enrol, unenrol
    from padel_app.services.presence_response import record_response
    from padel_app.models.presences import Presence

    ids, club_id = _world(app)
    lesson_id = _create(app, ids, club_id, hours_ahead=6)
    with app.app_context():
        inst = LessonInstance.query.filter_by(lesson_id=lesson_id).first()
        p = Presence.query.filter_by(lesson_instance_id=inst.id, player_id=ids["student_id"]).first()
        p.status = "absent"
        p.confirmed = False
        record_response(p, "cancelled")
        db.session.commit()
        live_scheduler._scheduler.remove_all_jobs()
        with patch(QUIET[0]), patch(QUIET[1]):
            enrol(ids["student_id"], inst, "coach")
            db.session.commit()

    row = _presences(app, lesson_id)[0]
    assert row["confirmed"] is False and row["response"] == "none"
    assert len(_ask_jobs(live_scheduler)) == 1


def test_a_students_own_request_accepted_late_is_counted_as_coming_and_not_asked(app, live_scheduler):
    """Owner's decision b. The accept path creates the class through add_class_service with
    notify_students=False (PAD-330): the acceptance message is the whole story, and the
    presence is answered yes."""
    ids, club_id = _world(app)

    lesson_id = _create(app, ids, club_id, hours_ahead=6, notify_students=False)

    row = _presences(app, lesson_id)[0]
    assert (row["confirmed"], row["response"], row["recorded_by"]) == (True, "confirmed", "system")
    assert _ask_jobs(live_scheduler) == []
    assert _added_messages(app, ids["student_user_id"]) == [], "not told twice"


def test_pad478s_dialog_never_lists_a_class_whose_students_are_counted_as_coming(app, live_scheduler):
    from padel_app.services.past_due_service import past_due

    ids, club_id = _world(app)
    _create(app, ids, club_id, hours_ahead=6)

    with app.app_context():
        assert past_due(ids["coach_id"])["reminders"] == []


def test_saying_no_afterwards_works_as_for_any_confirmed_student(app, live_scheduler):
    from padel_app.models import LessonInstance
    from padel_app.models.presences import Presence
    from padel_app.services.presence_response import record_response

    ids, club_id = _world(app)
    lesson_id = _create(app, ids, club_id, hours_ahead=6)
    with app.app_context():
        inst = LessonInstance.query.filter_by(lesson_id=lesson_id).first()
        p = Presence.query.filter_by(lesson_instance_id=inst.id, player_id=ids["student_id"]).first()
        record_response(p, "cancelled")
        p.status = "absent"
        p.confirmed = False
        db.session.commit()
        p = Presence.query.filter_by(lesson_instance_id=inst.id, player_id=ids["student_id"]).first()
        assert p.attendance_state == "not_coming"
