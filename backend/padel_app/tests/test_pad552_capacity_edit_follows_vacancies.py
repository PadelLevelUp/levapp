"""
PAD-552 — a coach's class edit brings the vacancies in line at once (notifications.invitations
rule 13a; numbering unconfirmed).

- A lower capacity runs the reconcile in the edit's own path: the open vacancies the class can no
  longer hold close and their live invitations expire, without waiting for the tick.
- A place the edit frees (a higher capacity, a student taken off) is opened through
  `trigger_invitations` under the usual gates, once the coach's invitation window is open.

Class times are the club's wall clock; dates in 2027 with a pinned clock. Summer: Lisbon is UTC+1.
"""
import contextlib
import os
import threading
import time
from datetime import datetime, timedelta
from unittest.mock import patch

import pytest

from padel_app.sql_db import db
from padel_app.tests.helpers import pin_clock

PATCHES = (
    "padel_app.services.notification_service.publish",
    "padel_app.services.notification_service.send_push_notification",
    "padel_app.services.replacement_approval_service.publish",
    "padel_app.services.replacement_approval_service.send_push_notification",
)
CLASS_WALL = datetime(2027, 7, 12, 18, 0)
CLASS_UTC = datetime(2027, 7, 12, 17, 0)
H = timedelta(hours=1)
POSTGRES_ONLY = pytest.mark.skipif(
    os.getenv("LEVAPP_TEST_DB", "sqlite").strip().lower() != "postgres",
    reason="a lock is only visible with two real connections",
)


@contextlib.contextmanager
def _io():
    with contextlib.ExitStack() as stack:
        for target in PATCHES:
            stack.enter_context(patch(target))
        yield


def _seed(*, cap, mode="automatic", tag="a"):
    """Coach; Ana and Bia enrolled; Xavi and Yara on the roster, free; a one-off class of `cap`."""
    from padel_app.models.Association_CoachLessonInstance import Association_CoachLessonInstance
    from padel_app.models.Association_CoachPlayer import Association_CoachPlayer
    from padel_app.models.clubs import Club
    from padel_app.models.coach_levels import CoachLevel
    from padel_app.models.coaches import Coach
    from padel_app.models.lesson_instances import LessonInstance
    from padel_app.models.lessons import Lesson
    from padel_app.models.notification_config import NotificationConfig
    from padel_app.models.players import Player
    from padel_app.models.presences import Presence
    from padel_app.models.users import User

    def user(name):
        u = User(name=name.title(), username=f"p552{tag}{name}", email=f"p552{tag}{name}@t.test",
                 password="x", status="active")
        db.session.add(u)
        db.session.flush()
        return u

    coach = Coach(user_id=user("coach").id)
    db.session.add(coach)
    db.session.flush()
    level = CoachLevel(coach_id=coach.id, label="B", code="B1", display_order=1)
    club = Club(name=f"P552 {tag}", description="", location="Lisboa")
    db.session.add_all([level, club])
    db.session.flush()
    lesson = Lesson(title=f"P552 {tag}", start_datetime=CLASS_WALL, end_datetime=CLASS_WALL + H,
                    is_recurring=False, type="academy", max_players=cap, color="#000",
                    status="active", club_id=club.id, default_level_id=level.id)
    db.session.add(lesson)
    db.session.flush()
    inst = LessonInstance(lesson_id=lesson.id, start_datetime=CLASS_WALL, end_datetime=CLASS_WALL + H,
                          max_players=cap, status="scheduled", notifications_enabled=True,
                          original_lesson_occurence_date=CLASS_WALL.date())
    db.session.add(inst)
    db.session.flush()
    db.session.add(Association_CoachLessonInstance(coach_id=coach.id, lesson_instance_id=inst.id))
    ids = {}
    for name in ("ana", "bia", "xavi", "yara"):
        p = Player(user_id=user(name).id)
        db.session.add(p)
        db.session.flush()
        db.session.add(Association_CoachPlayer(coach_id=coach.id, player_id=p.id, level_id=level.id))
        ids[name] = p.id
        if name in ("ana", "bia"):
            db.session.add(Presence(player_id=p.id, lesson_instance_id=inst.id, invited=True,
                                    enrolment_source="roster"))
    db.session.add(NotificationConfig(
        coach_id=coach.id, auto_notify_enabled=True, invitation_mode=mode,
        invitation_groups=[{"id": "1", "rules": []}],
        restrictions={"maxSimultaneous": {"enabled": True, "value": 5},
                      "maxTotal": {"enabled": False, "value": 10}},
    ))
    db.session.commit()
    return {**ids, "coach": coach.id, "instance": inst.id}


def _payload(inst, **extra):
    return {"date": inst.start_datetime.strftime("%Y-%m-%d"),
            "start_time": inst.start_datetime.strftime("%H:%M"),
            "end_time": inst.end_datetime.strftime("%H:%M"), **extra}


def _inst(ids):
    from padel_app.models.lesson_instances import LessonInstance
    return db.session.get(LessonInstance, ids["instance"])


def _vacancies(ids, status=None):
    from padel_app.models.vacancy import Vacancy
    q = Vacancy.query.filter_by(lesson_instance_id=ids["instance"])
    return q.filter_by(status=status).all() if status else q.all()


def _live_invites(ids):
    """Live invitations for a place of the class. A waiting-list offer (no vacancy) is not one:
    a yes that finds the class full is offered the list, which is correct."""
    from padel_app.models.notification_event import NotificationEvent
    return NotificationEvent.query.filter(
        NotificationEvent.lesson_instance_id == ids["instance"],
        NotificationEvent.vacancy_id.isnot(None),
        NotificationEvent.status.in_(("sent", "queued"))).count()


def test_a_lower_capacity_retires_the_offers_at_once(app, monkeypatch):
    from padel_app.services.lesson_service import edit_lesson_instance_helper
    from padel_app.services.notification_service import trigger_invitations

    pin_clock(monkeypatch, CLASS_UTC - 12 * H)
    with app.app_context(), _io():
        ids = _seed(cap=3, tag="drop")
        trigger_invitations(_inst(ids), ids["coach"], now=CLASS_UTC - 12 * H)
        assert len(_vacancies(ids, "open")) == 1 and _live_invites(ids) == 2

        edit_lesson_instance_helper(_payload(_inst(ids), max_players=2), _inst(ids))

        assert _vacancies(ids, "open") == [], "the open place the class no longer has is closed now"
        assert _live_invites(ids) == 0, "its offers are retired now, not at the next tick"


def test_a_higher_capacity_opens_the_new_place(app, monkeypatch):
    from padel_app.services.lesson_service import edit_lesson_instance_helper

    pin_clock(monkeypatch, CLASS_UTC - 12 * H)
    with app.app_context(), _io():
        ids = _seed(cap=2, tag="rise")
        assert _vacancies(ids) == []
        edit_lesson_instance_helper(_payload(_inst(ids), max_players=3), _inst(ids))
        assert len(_vacancies(ids, "open")) == 1
        assert _live_invites(ids) == 2, "Xavi and Yara are invited for the new place"


def test_taking_a_student_off_opens_their_place(app, monkeypatch):
    from padel_app.services.lesson_service import edit_lesson_instance_helper

    pin_clock(monkeypatch, CLASS_UTC - 12 * H)
    with app.app_context(), _io():
        ids = _seed(cap=2, tag="rm")
        edit_lesson_instance_helper(_payload(_inst(ids), remove_player_ids=[ids["bia"]]), _inst(ids))
        assert len(_vacancies(ids, "open")) == 1
        assert _live_invites(ids) >= 1


def test_before_the_window_opens_nothing_is_created(app, monkeypatch):
    """Invitations start 24 h before by default; 30 h out the class's own start job opens it later."""
    from padel_app.services.lesson_service import edit_lesson_instance_helper

    pin_clock(monkeypatch, CLASS_UTC - 30 * H)
    with app.app_context(), _io():
        ids = _seed(cap=2, tag="early")
        edit_lesson_instance_helper(_payload(_inst(ids), max_players=3), _inst(ids))
        assert _vacancies(ids) == [] and _live_invites(ids) == 0


def test_semi_automatic_asks_the_coach_and_sends_nothing(app, monkeypatch):
    from padel_app.models.replacement_approval_prompt import ReplacementApprovalPrompt
    from padel_app.services.lesson_service import edit_lesson_instance_helper

    pin_clock(monkeypatch, CLASS_UTC - 12 * H)
    with app.app_context(), _io():
        ids = _seed(cap=2, mode="semi_automatic", tag="semi")
        edit_lesson_instance_helper(_payload(_inst(ids), max_players=3), _inst(ids))
        (vacancy,) = _vacancies(ids, "open")
        assert vacancy.approval_status == "pending"
        assert ReplacementApprovalPrompt.query.filter_by(vacancy_id=vacancy.id).count() == 1
        assert _live_invites(ids) == 0


def test_an_unrelated_edit_sends_nothing(app, monkeypatch):
    from padel_app.services.lesson_service import edit_lesson_instance_helper

    pin_clock(monkeypatch, CLASS_UTC - 12 * H)
    with app.app_context(), _io():
        ids = _seed(cap=2, tag="title")
        edit_lesson_instance_helper(_payload(_inst(ids), title="Renamed"), _inst(ids))
        assert _vacancies(ids) == [] and _live_invites(ids) == 0


# ── Postgres only: a capacity drop racing a yes ─────────────────────────────────────────────────

@POSTGRES_ONLY
@pytest.mark.parametrize("first", ["yes", "drop"])
def test_a_drop_racing_a_yes_never_leaves_an_offer_for_a_missing_seat(app, monkeypatch, first):
    """Cap 3, Ana and Bia enrolled, one open place offered to Xavi and Yara. Xavi says yes while the
    coach lowers the capacity to 2. Each ordering is forced (the other side waits 0.3 s after both
    arrive). Yes first: Xavi takes the place, the class is over-full by the coach's own edit, and no
    offer stays live. Drop first: the place closes and its offers expire, so Xavi's yes takes
    nothing. Never a deadlock, and never a live offer for a seat the class no longer has."""
    from padel_app.models.notification_event import NotificationEvent
    from padel_app.models.presences import Presence
    from padel_app.services import notification_service as ns
    from padel_app.services.lesson_service import edit_lesson_instance_helper

    now = CLASS_UTC - 12 * H
    pin_clock(monkeypatch, now)
    with app.app_context(), _io():
        ids = _seed(cap=3, tag=f"race{first}")
        ns.trigger_invitations(_inst(ids), ids["coach"], now=now)
        event_id = NotificationEvent.query.filter_by(lesson_instance_id=ids["instance"],
                                                     player_id=ids["xavi"]).one().id
        from padel_app.models.players import Player
        xavi_user = db.session.get(Player, ids["xavi"]).user_id

    gate = threading.Barrier(2)

    def wait(me):
        try:
            gate.wait(timeout=1.5)
        except threading.BrokenBarrierError:
            pass
        if me != first:
            time.sleep(0.3)

    real_lock = ns._lock_vacancy_and_instance
    real_reconcile = ns.reconcile_vacancies

    def gated_lock(*a, **k):
        wait("yes")
        return real_lock(*a, **k)

    def gated_reconcile(*a, **k):
        wait("drop")
        return real_reconcile(*a, **k)

    monkeypatch.setattr(ns, "_lock_vacancy_and_instance", gated_lock)
    monkeypatch.setattr(ns, "reconcile_vacancies", gated_reconcile)
    errors = []

    def run(fn):
        def go():
            try:
                with app.app_context(), _io():
                    fn()
                    db.session.remove()
            except BaseException as exc:  # noqa: BLE001
                errors.append(exc)
        return threading.Thread(target=go)

    def yes():
        ns.respond_to_notification(event_id, "yes", xavi_user)

    def drop():
        edit_lesson_instance_helper(_payload(_inst(ids), max_players=2), _inst(ids))

    threads = [run(yes), run(drop)]
    for t in threads:
        t.start()
    for t in threads:
        t.join(timeout=60)
    assert not any(t.is_alive() for t in threads), "a caller never finished (deadlock?)"
    assert not errors, errors

    with app.app_context():
        assert _live_invites(ids) == 0, "an offer is still live for a seat the class no longer has"
        assert _vacancies(ids, "open") == []
        xavi_in = Presence.query.filter_by(lesson_instance_id=ids["instance"], player_id=ids["xavi"]).first()
        if first == "drop":
            assert xavi_in is None, "the yes took a seat the class no longer had"
