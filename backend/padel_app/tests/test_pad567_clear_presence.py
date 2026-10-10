"""PAD-567 (attendance.validation rule 26): a coach clears a mark back to "no answer".

Everything goes through ``add_presences`` with ``{"playerId", "clear": true}`` (the endpoint
test at the end goes through the route). Fixtures are the reminder-flow world with a pinned
class start, so nothing here reads the wall clock except where the late ask needs a real
"now" against a class in the future ([[pinned-now-tests-must-pin-their-fixtures]]).
"""
from datetime import datetime, timedelta
from unittest.mock import patch

import pytest
from flask_jwt_extended import create_access_token

from padel_app.sql_db import db
from padel_app.tests.helpers import pin_clock
from padel_app.tests.test_notification_reminder_flow import (
    PATCHES,
    _seed_coach_and_student,
    _seed_instance,
)

START = datetime(2026, 11, 17, 18, 0)  # club wall clock; a Tuesday in winter time


def _fire():
    from padel_app.models.notification_config import DEFAULT_REMINDER_TIMING
    from padel_app.scheduler import _fire_time_utc

    return _fire_time_utc(START, DEFAULT_REMINDER_TIMING)


@pytest.fixture(autouse=True)
def _no_outbound():
    with patch(PATCHES[0]), patch(PATCHES[1]):
        yield


@pytest.fixture
def world(app):
    from padel_app.models import Association_CoachLesson, Association_CoachPlayer, LessonInstance

    ids = _seed_coach_and_student(app)
    iid = _seed_instance(app, ids["coach_id"], ids["student_id"], start=START)
    with app.app_context():
        db.session.add(Association_CoachPlayer(coach_id=ids["coach_id"], player_id=ids["student_id"]))
        # the backlog count walks coach → lessons → occurrences (rule 18)
        db.session.add(Association_CoachLesson(coach_id=ids["coach_id"], lesson_id=db.session.get(LessonInstance, iid).lesson_id))
        db.session.commit()
    return ids, iid


def _row(app, iid, player_id):
    from padel_app.models.presences import Presence

    with app.app_context():
        return Presence.query.filter_by(lesson_instance_id=iid, player_id=player_id).one()


def _mark(app, iid, player_id, **mark):
    from padel_app.models import LessonInstance
    from padel_app.services.lesson_service import add_presences

    with app.app_context():
        return add_presences(db.session.get(LessonInstance, iid), [{"playerId": player_id, **mark}])


def _shape(row):
    return (row.status, row.justification, row.validated, row.response, row.responded_at,
            row.recorded_by, row.confirmed, row.attendance_state)


# ── the never-answered shape ────────────────────────────────────────────────────────────


def test_clear_writes_the_never_answered_shape(app, world, monkeypatch):
    ids, iid = world
    pin_clock(monkeypatch, _fire() - timedelta(days=1))
    from padel_app.services.notification_service import respond_to_reminder

    with app.app_context():
        # the state came from the student's own answer AND the coach's mark
        respond_to_reminder(iid, "no", ids["student_user_id"])
    _mark(app, iid, ids["student_id"], status="present")
    before = _shape(_row(app, iid, ids["student_id"]))
    assert before[0] == "present" and before[2] is True and before[3] == "declined"

    _mark(app, iid, ids["student_id"], clear=True)
    row = _row(app, iid, ids["student_id"])
    assert _shape(row) == (None, None, False, "none", None, None, False, "planned")
    assert row.invited is True, "the enrolment itself is untouched"


def test_clearing_a_validated_row_brings_a_past_class_back_to_the_backlog(app, world, monkeypatch):
    ids, iid = world
    now = pin_clock(monkeypatch, _fire() + timedelta(days=3))  # the class is over
    from padel_app.services.presence_overview_service import count_pending_validation_total
    from padel_app.tests.test_pad259_readers import _second_student
    from padel_app.models import LessonInstance
    from padel_app.services.lesson_service import enrol

    with app.app_context():
        carol, _ = _second_student(app, ids["coach_id"], "carol")
        enrol(carol, db.session.get(LessonInstance, iid), "coach")
    _mark(app, iid, ids["student_id"], status="present")
    _mark(app, iid, carol, status="absent", justification="justified")
    with app.app_context():
        assert count_pending_validation_total(coach_id=ids["coach_id"], now=now) == 0, "validated"

    _mark(app, iid, ids["student_id"], clear=True)
    with app.app_context():
        assert count_pending_validation_total(coach_id=ids["coach_id"], now=now) == 1
    assert _row(app, iid, ids["student_id"]).validated is False
    carol_row = _row(app, iid, carol)
    assert (carol_row.status, carol_row.justification, carol_row.validated) == ("absent", "justified", True), (
        "the other row keeps its mark"
    )


# ── capacity ────────────────────────────────────────────────────────────────────────────


def test_clearing_an_absence_reopens_the_seat_and_closes_her_vacancy(app, world, monkeypatch):
    ids, iid = world
    pin_clock(monkeypatch, _fire() - timedelta(days=1))
    from padel_app.models import LessonInstance, NotificationEvent, Vacancy
    from padel_app.services.lesson_service import enrol
    from padel_app.services.notification_service import _ensure_vacancy_for_player, _open_vacancy_for
    from padel_app.tests.test_pad259_readers import _second_student

    with app.app_context():
        bea, _ = _second_student(app, ids["coach_id"], "bea")
    _mark(app, iid, ids["student_id"], status="absent", justification="justified")
    with app.app_context():
        inst = db.session.get(LessonInstance, iid)
        assert inst.effective_filled_spots == 0
        vacancy = _ensure_vacancy_for_player(inst, ids["coach_id"], ids["student_id"])
        assert vacancy is not None and vacancy.status == "open"
        db.session.add(NotificationEvent(
            coach_id=ids["coach_id"], lesson_instance_id=iid, player_id=bea, type="auto",
            round_number=1, status="sent", vacancy_id=vacancy.id,
        ))
        db.session.commit()

    _mark(app, iid, ids["student_id"], clear=True)
    with app.app_context():
        inst = db.session.get(LessonInstance, iid)
        assert inst.effective_filled_spots == 1, "she holds her seat again"
        assert _open_vacancy_for(iid, ids["student_id"]) is None, "her vacancy is closed"
        assert Vacancy.query.filter_by(lesson_instance_id=iid, status="open").count() == 0
        assert NotificationEvent.query.filter_by(lesson_instance_id=iid, player_id=bea).one().status != "sent", (
            "Bea's invitation for that seat is retired"
        )


def test_the_freed_spot_was_taken_the_server_allows_the_clear(app, world, monkeypatch):
    ids, iid = world
    pin_clock(monkeypatch, _fire() - timedelta(days=1))
    from padel_app.models import LessonInstance
    from padel_app.services.lesson_service import enrol
    from padel_app.tests.test_pad259_readers import _second_student

    with app.app_context():
        inst = db.session.get(LessonInstance, iid)
        inst.max_players = 1
        db.session.commit()
    _mark(app, iid, ids["student_id"], status="absent", justification="unjustified")
    with app.app_context():
        bea, _ = _second_student(app, ids["coach_id"], "bea")
        enrol(bea, db.session.get(LessonInstance, iid), "fill", confirmed=True)
        assert db.session.get(LessonInstance, iid).effective_filled_spots == 1

    _mark(app, iid, ids["student_id"], clear=True)  # never refuses
    with app.app_context():
        assert db.session.get(LessonInstance, iid).effective_filled_spots == 2, "over capacity, as warned"
    assert _row(app, iid, ids["student_id"]).attendance_state == "planned"


# ── reminders: eligible again, asked again, at most once per clear ──────────────────────


def _ask_jobs(sched, iid):
    return [j for j in sched._scheduler.get_jobs() if j.id.startswith(f"ask_{iid}_")]


def test_a_cleared_student_is_asked_again_once(app, world, live_scheduler, monkeypatch):
    ids, iid = world
    now = pin_clock(monkeypatch, _fire() + timedelta(hours=1))  # the instant has passed
    from padel_app.services import reminder_attempt_service as attempts
    from padel_app.services.notification_service import send_class_reminders

    _mark(app, iid, ids["student_id"], status="present")  # the coach marked her before the pass
    with app.app_context():
        first = send_class_reminders(iid, now=now)
        assert first["sent"] == 0, "rule 23: the marked student is skipped"
        live_scheduler._scheduler.remove_all_jobs()

    _mark(app, iid, ids["student_id"], clear=True)
    with app.app_context():
        jobs = _ask_jobs(live_scheduler, iid)
        assert len(jobs) == 1, "one pass is armed for her"
        # the pass runs: she gets her reminder
        assert send_class_reminders(iid, now=now)["sent"] == 1
        assert attempts.count_attempts(iid, ids["student_id"]) == 1
        live_scheduler._scheduler.remove_all_jobs()

    # the bound: clearing twice sends once
    _mark(app, iid, ids["student_id"], status="present")
    _mark(app, iid, ids["student_id"], clear=True)
    with app.app_context():
        assert _ask_jobs(live_scheduler, iid) == [], "her reminder is live: nothing is armed"
        assert send_class_reminders(iid, now=now)["sent"] == 0
        assert attempts.count_attempts(iid, ids["student_id"]) == 1


@pytest.mark.parametrize("why", ["notifications_off", "class_over", "instant_ahead"])
def test_no_ask_is_armed_when_the_class_would_not_ask(app, world, live_scheduler, monkeypatch, why):
    ids, iid = world
    from padel_app.models import LessonInstance

    if why == "instant_ahead":
        pin_clock(monkeypatch, _fire() - timedelta(days=1))
    elif why == "class_over":
        pin_clock(monkeypatch, _fire() + timedelta(days=3))
    else:
        pin_clock(monkeypatch, _fire() + timedelta(hours=1))
        with app.app_context():
            db.session.get(LessonInstance, iid).notifications_enabled = False
            db.session.commit()
    _mark(app, iid, ids["student_id"], status="present")
    with app.app_context():
        live_scheduler._scheduler.remove_all_jobs()
    _mark(app, iid, ids["student_id"], clear=True)
    with app.app_context():
        assert _ask_jobs(live_scheduler, iid) == []


# ── the route: `cleared` in the reply, semi-auto recompute ─────────────────────────────


@pytest.fixture(autouse=True)
def _jwt_secret(app):
    app.config["JWT_SECRET_KEY"] = "test-secret"


def _h(app, user_id):
    with app.app_context():
        token = create_access_token(identity=str(user_id))
    return {"Authorization": f"Bearer {token}"}


def _post(client, app, ids, iid, presences):
    from padel_app.models import LessonInstance

    with app.app_context():
        lesson_id = db.session.get(LessonInstance, iid).lesson_id
    return client.post(
        "/api/app/class_instance/presences/confirm",
        headers=_h(app, ids["coach_user_id"]),
        json={
            "classInstance": {"id": f"lessoninstance-{iid}", "originalId": iid, "parentClassId": lesson_id},
            "presences": presences,
        },
    )


def test_the_route_lists_the_cleared_rows(client, app, world, monkeypatch):
    ids, iid = world
    pin_clock(monkeypatch, _fire() - timedelta(days=1))
    assert _post(client, app, ids, iid, [{"playerId": ids["student_id"], "status": "present"}]).status_code == 200
    res = _post(client, app, ids, iid, [{"playerId": ids["student_id"], "clear": True}])
    assert res.status_code == 200, res.data
    body = res.get_json()
    assert body["cleared"] == [ids["student_id"]]
    assert body["presences"][0]["attendanceState"] == "planned"


def test_clearing_an_absence_in_semi_auto_recomputes_the_suggestions(client, app, world, monkeypatch):
    ids, iid = world
    pin_clock(monkeypatch, _fire() - timedelta(days=1))
    from padel_app.models.notification_config import NotificationConfig

    with app.app_context():
        db.session.add(NotificationConfig(coach_id=ids["coach_id"], auto_notify_enabled=True,
                                          invitation_mode="semi_automatic"))
        db.session.commit()
    assert _post(client, app, ids, iid, [{"playerId": ids["student_id"], "status": "absent",
                                          "justification": "justified"}]).status_code == 200
    with patch("padel_app.services.replacement_approval_service.recompute_suggestions",
               return_value={"state": "none"}) as recompute:
        res = _post(client, app, ids, iid, [{"playerId": ids["student_id"], "clear": True}])
    assert res.status_code == 200, res.data
    recompute.assert_called_once()
    assert recompute.call_args.args[:2] == (iid, ids["coach_id"])
    assert res.get_json()["cleared"] == [ids["student_id"]]


def test_clearing_a_present_row_in_semi_auto_recomputes_nothing(client, app, world, monkeypatch):
    ids, iid = world
    pin_clock(monkeypatch, _fire() - timedelta(days=1))
    from padel_app.models.notification_config import NotificationConfig

    with app.app_context():
        db.session.add(NotificationConfig(coach_id=ids["coach_id"], auto_notify_enabled=True,
                                          invitation_mode="semi_automatic"))
        db.session.commit()
    assert _post(client, app, ids, iid, [{"playerId": ids["student_id"], "status": "present"}]).status_code == 200
    with patch("padel_app.services.replacement_approval_service.recompute_suggestions") as recompute:
        assert _post(client, app, ids, iid, [{"playerId": ids["student_id"], "clear": True}]).status_code == 200
    recompute.assert_not_called()
