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


def _seed(*, cap, mode="automatic", tag="a", recurring=False, invite_hours=24):
    """Coach; Ana and Bia enrolled; Xavi and Yara on the roster, free; a one-off class of `cap`."""
    import json

    from padel_app.models.Association_CoachLesson import Association_CoachLesson
    from padel_app.models.Association_CoachLessonInstance import Association_CoachLessonInstance
    from padel_app.models.Association_PlayerLesson import Association_PlayerLesson
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
                    is_recurring=recurring, type="academy", max_players=cap, color="#000",
                    status="active", club_id=club.id, default_level_id=level.id,
                    recurrence_rule=json.dumps({"frequency": "weekly", "daysOfWeek": [1]}) if recurring else None)
    db.session.add(lesson)
    db.session.flush()
    db.session.add(Association_CoachLesson(coach_id=coach.id, lesson_id=lesson.id))
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
            db.session.add(Association_PlayerLesson(player_id=p.id, lesson_id=lesson.id))
    cfg = NotificationConfig(
        coach_id=coach.id, auto_notify_enabled=True, invitation_mode=mode,
        invitation_groups=[{"id": "1", "rules": []}],
        restrictions={"maxSimultaneous": {"enabled": True, "value": 5},
                      "maxTotal": {"enabled": False, "value": 10}},
    )
    db.session.add(cfg)
    db.session.flush()
    cfg.reminder_timing = {"invitationStart": {"type": "hours_before", "value": invite_hours}}
    db.session.commit()
    return {**ids, "coach": coach.id, "instance": inst.id, "lesson": lesson.id}


def _edit(ids, updates, *, scope="single", instance_id=None):
    """The coach's edit, through POST /edit_class's service (#577 review: the whole edit, flags
    included, is written before the vacancies move)."""
    from padel_app.models.lesson_instances import LessonInstance
    from padel_app.services.lesson_service import edit_class_service

    inst = db.session.get(LessonInstance, instance_id or ids["instance"])
    event = {"model": "LessonInstance", "originalId": inst.id,
             "date": inst.start_datetime.strftime("%Y-%m-%d")}
    result, status = edit_class_service({"event": event, "scope": scope, "updates": updates})
    assert status in (200, 201), result
    return result


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
    from padel_app.services.notification_service import trigger_invitations

    pin_clock(monkeypatch, CLASS_UTC - 12 * H)
    with app.app_context(), _io():
        ids = _seed(cap=3, tag="drop")
        trigger_invitations(_inst(ids), ids["coach"], now=CLASS_UTC - 12 * H)
        assert len(_vacancies(ids, "open")) == 1 and _live_invites(ids) == 2

        _edit(ids, {"maxPlayers": 2})

        assert _vacancies(ids, "open") == [], "the open place the class no longer has is closed now"
        assert _live_invites(ids) == 0, "its offers are retired now, not at the next tick"


def test_a_higher_capacity_opens_the_new_place(app, monkeypatch):

    pin_clock(monkeypatch, CLASS_UTC - 12 * H)
    with app.app_context(), _io():
        ids = _seed(cap=2, tag="rise")
        assert _vacancies(ids) == []
        _edit(ids, {"maxPlayers": 3})
        assert len(_vacancies(ids, "open")) == 1
        assert _live_invites(ids) == 2, "Xavi and Yara are invited for the new place"


def test_taking_a_student_off_opens_their_place(app, monkeypatch):

    pin_clock(monkeypatch, CLASS_UTC - 12 * H)
    with app.app_context(), _io():
        ids = _seed(cap=2, tag="rm")
        _edit(ids, {"removePlayers": [ids["bia"]]})
        assert len(_vacancies(ids, "open")) == 1
        assert _live_invites(ids) >= 1


def test_before_the_window_opens_nothing_is_created(app, monkeypatch):
    """Invitations start 24 h before by default; 30 h out the class's own start job opens it later."""

    pin_clock(monkeypatch, CLASS_UTC - 30 * H)
    with app.app_context(), _io():
        ids = _seed(cap=2, tag="early")
        _edit(ids, {"maxPlayers": 3})
        assert _vacancies(ids) == [] and _live_invites(ids) == 0


def test_semi_automatic_asks_the_coach_and_sends_nothing(app, monkeypatch):
    from padel_app.models.replacement_approval_prompt import ReplacementApprovalPrompt

    pin_clock(monkeypatch, CLASS_UTC - 12 * H)
    with app.app_context(), _io():
        ids = _seed(cap=2, mode="semi_automatic", tag="semi")
        _edit(ids, {"maxPlayers": 3})
        (vacancy,) = _vacancies(ids, "open")
        assert vacancy.approval_status == "pending"
        assert ReplacementApprovalPrompt.query.filter_by(vacancy_id=vacancy.id).count() == 1
        assert _live_invites(ids) == 0


def test_an_unrelated_edit_sends_nothing(app, monkeypatch):

    pin_clock(monkeypatch, CLASS_UTC - 12 * H)
    with app.app_context(), _io():
        ids = _seed(cap=2, tag="title")
        _edit(ids, {"name": "Renamed"})
        assert _vacancies(ids) == [] and _live_invites(ids) == 0


def test_a_raise_with_automatic_invitations_switched_off_in_the_same_edit_sends_nothing(app, monkeypatch):
    """#577 review probe: {maxPlayers: 3, autoInvites: false} sent 2 invitations, because the
    place was opened before the edit wrote the class's own flag."""
    pin_clock(monkeypatch, CLASS_UTC - 12 * H)
    with app.app_context(), _io():
        ids = _seed(cap=2, tag="offflag")
        _edit(ids, {"maxPlayers": 3, "autoInvites": False})
        assert _live_invites(ids) == 0
        assert _vacancies(ids, "open") == []


def test_a_raise_with_notifications_switched_off_in_the_same_edit_sends_nothing(app, monkeypatch):
    pin_clock(monkeypatch, CLASS_UTC - 12 * H)
    with app.app_context(), _io():
        ids = _seed(cap=2, tag="offnotif")
        _edit(ids, {"maxPlayers": 3, "notificationsEnabled": False})
        assert _live_invites(ids) == 0


def test_a_this_and_future_raise_opens_every_occurrence_it_reaches(app, monkeypatch):
    """#577 review probe: the lesson is edited before its occurrences, so a capacity read inside
    the walk already saw the new value and nothing opened. Two materialised Mondays, invitations
    open 10 days ahead: both get their new place."""
    from padel_app.models.lessons import Lesson
    from padel_app.services.lesson_service import get_or_materialize_instance

    pin_clock(monkeypatch, CLASS_UTC - 12 * H)
    with app.app_context(), _io():
        ids = _seed(cap=2, tag="series", recurring=True, invite_hours=240)
        lesson = db.session.get(Lesson, ids["lesson"])
        nxt = get_or_materialize_instance(lesson, (CLASS_WALL + timedelta(days=7)).date())
        db.session.commit()
        next_id = nxt.id
        _edit(ids, {"maxPlayers": 3}, scope="future")

        from padel_app.models.vacancy import Vacancy
        for iid in (ids["instance"], next_id):
            assert Vacancy.query.filter_by(lesson_instance_id=iid, status="open").count() == 1, iid


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
        _edit(ids, {"maxPlayers": 2})

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
