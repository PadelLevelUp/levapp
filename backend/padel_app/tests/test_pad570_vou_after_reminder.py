"""PAD-570 (attendance.confirm rules 27-29, dashboard.blocks rule 3a): a student may say
"Vou" only once asked, and "Não vou" is final.

The ask is ONE server predicate served as ``pendingConfirmation`` on the class-detail payload
and every dashboard surface. Every test here pins "now" relative to the reminder instant
(``_fire_time_utc``) and pins the fixture class, so nothing here depends on the wall clock
([[pinned-now-tests-must-pin-their-fixtures]]).
"""
from datetime import datetime, timedelta
from unittest.mock import patch

import pytest

from padel_app.sql_db import db
from padel_app.tests.helpers import pin_clock
from padel_app.tests.test_notification_reminder_flow import (
    PATCHES,
    _seed_coach_and_student,
    _seed_instance,
)

# A Tuesday evening in winter time: no DST edge inside the 48 h window.
START = datetime(2026, 11, 17, 18, 0)  # club wall clock, as stored
FIRE = None  # computed once the app is up (needs the timing helper)


def _fire():
    from padel_app.models.notification_config import DEFAULT_REMINDER_TIMING
    from padel_app.scheduler import _fire_time_utc

    return _fire_time_utc(START, DEFAULT_REMINDER_TIMING)


@pytest.fixture
def world(app):
    ids = _seed_coach_and_student(app)
    iid = _seed_instance(app, ids["coach_id"], ids["student_id"], start=START)
    return ids, iid


def _payload(app, iid, player_id):
    from padel_app.models import LessonInstance
    from padel_app.serializers.lesson import serialize_class_instance

    with app.app_context():
        return serialize_class_instance(db.session.get(LessonInstance, iid), viewer_player_id=player_id)


def _dashboard(app, ids, now_utc):
    """Hero, schedule rows, queue invites and the Invites tile, on the club's clock."""
    from padel_app.helpers.dashboard.player_home import (
        build_player_kpi_block,
        build_player_needs_you_block,
        build_player_next_class_block,
        build_player_schedule_block,
    )
    from padel_app.utils.dates import utc_to_wall_naive

    now = utc_to_wall_naive(now_utc)
    with app.app_context():
        hero = build_player_next_class_block(player_id=ids["student_id"], now=now)
        rows = build_player_schedule_block(player_id=ids["student_id"], now=now)["data"]["items"]
        queue = build_player_needs_you_block(player_id=ids["student_id"], user_id=ids["student_user_id"], now=now)
        kpis = build_player_kpi_block(player_id=ids["student_id"], now=now)["data"]["items"]
    invites = [i for i in queue["data"]["items"] if i["kind"] == "invite"]
    tile = next(i for i in kpis if i["label"] == "Invites")
    return hero["data"], rows[0], invites, tile["value"]


def _state(app, iid, player_id):
    from padel_app.models.presences import Presence

    with app.app_context():
        return Presence.query.filter_by(lesson_instance_id=iid, player_id=player_id).one().attendance_state


# ── rule 27: asked = the reminder instant, or a reminder actually sent ──────────────────


def test_before_the_instant_only_nao_vou_is_offered_and_a_yes_is_refused(app, world, monkeypatch):
    ids, iid = world
    now = pin_clock(monkeypatch, _fire() - timedelta(minutes=1))
    from padel_app.services.notification_service import respond_to_reminder

    payload = _payload(app, iid, ids["student_id"])
    assert payload["pendingConfirmation"] is False
    assert payload["coachUserId"] == str(ids["coach_user_id"]), "the chat shortcut's target (rule 28)"
    hero, row, invites, tile = _dashboard(app, ids, now)
    assert (hero["pendingConfirmation"], row["pendingConfirmation"]) == (False, False)
    assert hero["attendanceState"] == row["attendanceState"] == "planned"
    assert row["declineTarget"] == {"model": "LessonInstance", "originalId": iid, "date": "2026-11-17"}
    assert invites == [], "not asked yet, so not in Precisa de ti"
    assert tile == 0

    with app.app_context(), patch(PATCHES[0]), patch(PATCHES[1]):
        assert respond_to_reminder(iid, "yes", ids["student_user_id"], now=now) == {"action": "not_yet_asked"}
    assert _state(app, iid, ids["student_id"]) == "planned", "a refused yes records nothing"


def test_a_no_before_the_instant_is_still_a_proactive_decline(app, world, monkeypatch):
    ids, iid = world
    now = pin_clock(monkeypatch, _fire() - timedelta(minutes=1))
    from padel_app.services.notification_service import respond_to_reminder

    with app.app_context(), patch(PATCHES[0]), patch(PATCHES[1]):
        assert respond_to_reminder(iid, "no", ids["student_user_id"], now=now)["action"] == "declined"
    assert _state(app, iid, ids["student_id"]) == "not_coming"


def test_after_the_instant_vou_is_offered_and_recorded(app, world, monkeypatch):
    ids, iid = world
    now = pin_clock(monkeypatch, _fire() + timedelta(minutes=1))
    from padel_app.services.notification_service import respond_to_reminder

    assert _payload(app, iid, ids["student_id"])["pendingConfirmation"] is True
    hero, row, invites, tile = _dashboard(app, ids, now)
    assert (hero["pendingConfirmation"], row["pendingConfirmation"]) == (True, True)
    assert [i["lessonInstanceId"] for i in invites] == [iid]
    assert tile == 1

    with app.app_context(), patch(PATCHES[0]), patch(PATCHES[1]):
        assert respond_to_reminder(iid, "yes", ids["student_user_id"], now=now)["action"] == "confirmed"
    assert _state(app, iid, ids["student_id"]) == "coming"
    assert _payload(app, iid, ids["student_id"])["pendingConfirmation"] is False, "answered"
    assert _dashboard(app, ids, now)[3] == 0


def test_a_reminder_the_coach_sent_by_hand_counts_as_asked(app, world, monkeypatch):
    ids, iid = world
    now = pin_clock(monkeypatch, _fire() - timedelta(days=3))
    from padel_app.models.presences import Presence
    from padel_app.services import reminder_attempt_service as attempts
    from padel_app.services.notification_service import respond_to_reminder

    assert _payload(app, iid, ids["student_id"])["pendingConfirmation"] is False
    with app.app_context():
        row = Presence.query.filter_by(lesson_instance_id=iid, player_id=ids["student_id"]).one()
        attempts.record_attempt(message=None, instance_id=iid, player_id=ids["student_id"], presence_id=row.id, number=1, sent_at=now)
    assert _payload(app, iid, ids["student_id"])["pendingConfirmation"] is True
    hero, row, invites, tile = _dashboard(app, ids, now)
    assert row["pendingConfirmation"] is True and len(invites) == 1 and tile == 1
    with app.app_context(), patch(PATCHES[0]), patch(PATCHES[1]):
        assert respond_to_reminder(iid, "yes", ids["student_user_id"], now=now)["action"] == "confirmed"


def test_a_class_with_reminders_off_never_asks(app, world, monkeypatch):
    ids, iid = world
    now = pin_clock(monkeypatch, _fire() + timedelta(hours=1))
    from padel_app.models import LessonInstance
    from padel_app.services.notification_service import respond_to_reminder

    with app.app_context():
        db.session.get(LessonInstance, iid).notifications_enabled = False
        db.session.commit()
    assert _payload(app, iid, ids["student_id"])["pendingConfirmation"] is False
    hero, row, invites, tile = _dashboard(app, ids, now)
    assert (hero["pendingConfirmation"], row["pendingConfirmation"], invites, tile) == (False, False, [], 0)
    with app.app_context(), patch(PATCHES[0]), patch(PATCHES[1]):
        assert respond_to_reminder(iid, "yes", ids["student_user_id"], now=now) == {"action": "not_yet_asked"}
        # "Não vou" stays available at any time (the only thing the student can say).
        assert respond_to_reminder(iid, "no", ids["student_user_id"], now=now)["action"] == "declined"


def test_no_computable_instant_fails_closed(app, world, monkeypatch):
    ids, iid = world
    now = pin_clock(monkeypatch, _fire() + timedelta(hours=1))
    from padel_app.models.notification_config import NotificationConfig

    with app.app_context():
        db.session.add(NotificationConfig(coach_id=ids["coach_id"], reminder_type="bogus"))
        db.session.commit()
    assert _payload(app, iid, ids["student_id"])["pendingConfirmation"] is False


def test_a_coach_viewer_never_sees_the_flag_raised(app, world, monkeypatch):
    ids, iid = world
    pin_clock(monkeypatch, _fire() + timedelta(minutes=1))
    from padel_app.models import LessonInstance
    from padel_app.serializers.lesson import serialize_class_instance

    with app.app_context():
        assert serialize_class_instance(db.session.get(LessonInstance, iid))["pendingConfirmation"] is False


# ── rule 28: "Não vou" is final ─────────────────────────────────────────────────────────


def test_nao_vou_is_final_a_later_yes_is_refused_and_touches_nothing(app, world, monkeypatch):
    ids, iid = world
    now = pin_clock(monkeypatch, _fire() + timedelta(minutes=1))
    from padel_app.models import LessonInstance, Message, Vacancy
    from padel_app.services.notification_service import cancel_attendance, respond_to_reminder

    with app.app_context(), patch(PATCHES[0]), patch(PATCHES[1]):
        cancel_attendance(ids["student_user_id"], lesson_instance_id=iid, now=now)
        assert _state(app, iid, ids["student_id"]) == "not_coming"
        assert _payload(app, iid, ids["student_id"])["pendingConfirmation"] is False
        vacancies = Vacancy.query.filter_by(lesson_instance_id=iid).count()
        messages = Message.query.count()

        assert respond_to_reminder(iid, "yes", ids["student_user_id"], now=now) == {"action": "already_declined"}

        assert _state(app, iid, ids["student_id"]) == "not_coming"
        assert Vacancy.query.filter_by(lesson_instance_id=iid).count() == vacancies
        assert Message.query.count() == messages, "no coach message, no student message"
        assert db.session.get(LessonInstance, iid).effective_filled_spots == 0
    hero, row, invites, tile = _dashboard(app, ids, now)
    assert row["attendanceState"] == "not_coming" and row["pendingConfirmation"] is False
    assert invites == [] and tile == 0


# ── rule 29: the coach's mark stands ────────────────────────────────────────────────────


def test_a_student_the_coach_marked_present_is_never_asked(app, world, monkeypatch):
    ids, iid = world
    now = pin_clock(monkeypatch, _fire() + timedelta(minutes=1))
    from padel_app.models.presences import Presence
    from padel_app.services.notification_service import respond_to_reminder

    with app.app_context():
        row = Presence.query.filter_by(lesson_instance_id=iid, player_id=ids["student_id"]).one()
        row.status, row.validated = "present", True
        db.session.commit()
    assert _payload(app, iid, ids["student_id"])["pendingConfirmation"] is False
    assert _dashboard(app, ids, now)[2] == []
    with app.app_context(), patch(PATCHES[0]), patch(PATCHES[1]):
        assert respond_to_reminder(iid, "yes", ids["student_user_id"], now=now) == {"action": "already_marked"}
    assert _state(app, iid, ids["student_id"]) == "attended"
