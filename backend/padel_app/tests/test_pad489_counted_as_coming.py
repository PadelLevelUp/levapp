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


# ── review of #535 ────────────────────────────────────────────────────────────

def _request_world(app):
    """test_pad104's world: a coach with a club and a student linked to them, as the request
    service requires. Keys follow this file's: student_id, student_user_id."""
    from padel_app.tests.test_pad104_class_requests import _setup
    from padel_app.tests.test_pad330_the_student_is_told import _student_user_id

    ids = _setup(app)
    ids["student_id"] = ids["player_id"]
    ids["student_user_id"] = _student_user_id(app, ids["player_id"])
    return ids


def _request_for(app, ids, *, hours_ahead, invitees=()):
    """A student's own class request, through the real request service. `invitees` are usernames."""
    from padel_app.models import Player
    from padel_app.services.class_request_service import create_class_request_service

    from padel_app.utils import dates  # read at call time, so pin_clock reaches it

    with app.app_context():
        start = (utc_to_wall_naive(dates.utcnow_naive()) + timedelta(hours=hours_ahead)).replace(second=0, microsecond=0)
        row = create_class_request_service(
            db.session.get(Player, ids["student_id"]),
            {"coachId": ids["coach_id"], "date": start.date().isoformat(), "startTime": start.strftime("%H:%M"),
             "endTime": (start + timedelta(hours=1)).strftime("%H:%M"), "participants": list(invitees)},
        )
        db.session.commit()
        return row.id


def _accept(app, ids, rid):
    from padel_app.models import ClassRequest, Coach
    from padel_app.services.class_request_service import decide_class_request_service

    with app.app_context():
        with patch(QUIET[0]), patch(QUIET[1]):
            row = decide_class_request_service(rid, db.session.get(Coach, ids["coach_id"]), action="accept", data={})
            db.session.commit()
            assert row.status == "accepted"
            return db.session.get(ClassRequest, rid).lesson_id


# The two request-path tests book "six hours from now". test_pad104's coach is free 16:00-22:00, so
# on the real clock the slot fitted only when the test ran between about 10:00 and 15:00 Lisbon and
# was refused as slot_taken otherwise: red on CI from mid-afternoon (staging 71981fb80,
# 2026-10-03). "Now" is pinned to 11:00 on a weekday, so the slot is 17:00-18:00, inside that
# window, and its reminder time (24 h before) has already passed, which is what they test.
# _request_for reads the clock through `dates`: pytest imports this module outside `padel_app.*`,
# where pin_clock does not rebind a name imported at the top.
REQUEST_NOW = datetime(2026, 11, 10, 11, 0)  # a Tuesday; Lisbon is UTC+0 in November


def test_a_request_accepted_late_through_the_real_path_counts_the_requester(app, live_scheduler, monkeypatch):
    """Review of #535, finding 1: the request path, not add_class_service by hand."""
    from padel_app.tests.helpers import pin_clock

    pin_clock(monkeypatch, REQUEST_NOW)
    ids = _request_world(app)
    rid = _request_for(app, ids, hours_ahead=6)

    lesson_id = _accept(app, ids, rid)

    row = [r for r in _presences(app, lesson_id) if r["player"] == ids["student_id"]][0]
    assert (row["confirmed"], row["response"], row["recorded_by"]) == (True, "confirmed", "system")
    assert _ask_jobs(live_scheduler) == []
    assert _added_messages(app, ids["student_user_id"]) == [], "the acceptance message is the whole story"


def test_an_invitee_of_a_request_accepted_late_is_asked_not_counted(app, live_scheduler, monkeypatch):
    """Review of #535, finding 1 (coordinator's decision): the invitee did not ask for the class.
    They are told (rule 14's added message) and asked (rule 18), as before."""
    from padel_app.tests.helpers import pin_clock
    from padel_app.tests.test_pad128_eligibility import _add_student
    from padel_app.tests.test_pad330_the_student_is_told import _student_user_id

    pin_clock(monkeypatch, REQUEST_NOW)
    ids = _request_world(app)
    with app.app_context():
        carla = _add_student(ids["coach_id"], "carla", level_id=ids["level_ids"]["5"])
        db.session.commit()
    carla_user = _student_user_id(app, carla)
    rid = _request_for(app, ids, hours_ahead=6, invitees=["carla"])

    lesson_id = _accept(app, ids, rid)

    rows = {r["player"]: r for r in _presences(app, lesson_id)}
    assert rows[ids["student_id"]]["response"] == "confirmed", "the requester is counted"
    assert (rows[carla]["confirmed"], rows[carla]["response"]) == (False, "none"), "the invitee is not"
    jobs = _ask_jobs(live_scheduler)
    assert len(jobs) == 1 and f"_{carla}_" in jobs[0], "the invitee is asked by rule 18's late ask"
    told = _added_messages(app, carla_user)
    assert len(told) == 1 and told[0].msg_metadata.get("countedAsComing") is None, "told the ordinary message"


def test_a_class_with_notifications_off_is_not_counted(app, live_scheduler):
    """Review of #535, finding 2: no reminder would ever have asked them, so the reminder moment
    did not pass; today's behaviour stays."""
    from padel_app.models import Club, Coach
    from padel_app.services.lesson_service import add_class_service

    ids, club_id = _world(app)
    with app.app_context():
        start = (utc_to_wall_naive(utcnow_naive()) + timedelta(hours=6)).replace(second=0, microsecond=0)
        with patch(QUIET[0]), patch(QUIET[1]):
            lesson = add_class_service(
                {"name": "Quiet class", "classType": "academy", "maxPlayers": 4, "color": "#000",
                 "date": start.date().isoformat(), "startTime": start.strftime("%H:%M"),
                 "endTime": (start + timedelta(hours=1)).strftime("%H:%M"),
                 "playerIds": [ids["student_id"]], "notificationsEnabled": False},
                db.session.get(Coach, ids["coach_id"]), db.session.get(Club, club_id),
            )
            db.session.commit()
            lesson_id = lesson.id

    assert _presences(app, lesson_id) == []
    msgs = _added_messages(app, ids["student_user_id"])
    assert len(msgs) == 1 and msgs[0].msg_metadata.get("countedAsComing") is None


def test_the_started_boundary_is_the_clubs_clock(app, live_scheduler):
    """Review of #535, mutant M10: a class that started half an hour ago on the club's clock is
    not counted, whatever the UTC offset."""
    ids, club_id = _world(app)

    lesson_id = _create(app, ids, club_id, hours_ahead=-0.5, title="Already started")

    assert _presences(app, lesson_id) == []
    assert _ask_jobs(live_scheduler) == []


def test_a_series_counts_only_the_occurrence_whose_reminder_time_has_passed(app, live_scheduler):
    """Review of #535, mutant M1: two occurrences inside the look-ahead, only the first late."""
    from padel_app.models import Club, Coach
    from padel_app.services.lesson_service import add_class_service

    ids, club_id = _world(app)
    with app.app_context():
        start = (utc_to_wall_naive(utcnow_naive()) + timedelta(hours=20)).replace(second=0, microsecond=0)
        second = start + timedelta(days=2)   # 68 h ahead: its 48 h reminder is still 20 h away
        with patch(QUIET[0]), patch(QUIET[1]):
            lesson = add_class_service(
                {"name": "Twice a week", "classType": "academy", "maxPlayers": 4, "color": "#000",
                 "date": start.date().isoformat(), "startTime": start.strftime("%H:%M"),
                 "endTime": (start + timedelta(hours=1)).strftime("%H:%M"),
                 "isRecurring": True,
                 "recurrenceRule": {"frequency": "weekly",
                                    "daysOfWeek": sorted({(start.weekday() + 1) % 7, (second.weekday() + 1) % 7})},
                 "endDate": (start + timedelta(weeks=3)).date().isoformat(),
                 "playerIds": [ids["student_id"]]},
                db.session.get(Coach, ids["coach_id"]), db.session.get(Club, club_id),
            )
            db.session.commit()
            lesson_id = lesson.id
            first_date = start.date().isoformat()

    rows = _presences(app, lesson_id)
    assert [r["date"] for r in rows] == [first_date], "exactly the late occurrence"
    assert rows[0]["response"] == "confirmed"

