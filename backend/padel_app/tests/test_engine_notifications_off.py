"""engine-store rule 17: a new-engine session whose notifications are off is never planned, on any path.

The tick lists only sessions whose three switches are on (notifications.config rule 19); every request
path (a No, an invitation's answer, a class edit's re-plan, ...) must read the same switches, so a class
whose notifications are off gets no automatic invitation, while the request's own effects and the coach's
sends by hand still go. Everything here goes through the app's entry points on ``TableStore``.

``_class``: ``_seed`` (test_pad916_engine_store) with ten students and two seats, the first student the
regular on the left; the right seat is open from the start. NOW is two hours before the class.
"""
from datetime import timedelta

import pytest

from padel_app.sql_db import db
from padel_app.tests.test_pad916_engine_store import NOW, START, _seed

AT = NOW + timedelta(minutes=5)


@pytest.fixture
def env(app, monkeypatch):
    from padel_app.tests.helpers import pin_clock
    from padel_app.utils import expo_push, push_notifications

    import padel_app.services.engine_entry  # noqa: F401 — loaded before the pin, so it reads the pinned clock

    app.config["JWT_SECRET_KEY"] = "test-secret"
    monkeypatch.setattr(push_notifications, "send_push_notification", lambda **kw: None)
    monkeypatch.setattr(expo_push, "send_expo_push_to_user", lambda *a, **k: None)
    with app.app_context():
        pin_clock(monkeypatch, NOW)
        yield app


def _config(coach_id, auto_notify=True):
    from padel_app.models.notification_config import NotificationConfig

    db.session.add(NotificationConfig(coach_id=coach_id, auto_notify_enabled=auto_notify, open_spots_visible=True,
                                      engine_version="new", engine_switched_at=NOW - timedelta(days=1)))
    db.session.commit()


def _class(app, *, notifications=True, auto_notify=True, private=False, starts=(START,)):
    store, sessions, pids = _seed(app, starts=starts, players=10, capacity=2, side="left")
    for s in sessions:
        inst = _instance(s)
        inst.notifications_enabled = notifications
        if private:
            inst.lesson.type = "private"
    db.session.commit()
    _config(store.coach_of(sessions[0]), auto_notify)
    return store, sessions, pids


def _instance(session):
    from padel_app.models.lesson_instances import LessonInstance

    return db.session.get(LessonInstance, int(session))


def _presence(session, student):
    from padel_app.models.presences import Presence

    return Presence.query.filter_by(lesson_instance_id=int(session), player_id=int(student)).one()


def _invited(session) -> set[str]:
    from padel_app.models import EngineInvitation

    db.session.expire_all()
    return {str(r.player_id) for r in EngineInvitation.query.filter_by(lesson_instance_id=int(session)).all()}


def _outbox_to_others(session, student) -> list:
    from padel_app.models import EngineEffect
    from padel_app.services.engine_store import OUTBOX

    kinds = {k.__name__ for k in OUTBOX}
    return [(r.kind, r.player_id) for r in EngineEffect.query.filter_by(lesson_instance_id=int(session)).all()
            if r.kind in kinds and str(r.player_id) != str(student)]


def _regular_says_no(session, regular, at=AT):
    from padel_app.services.engine_entry import student_not_going

    student_not_going(_instance(session), _presence(session, regular), at)


def _answer(session, student, yes, at):
    from padel_app.models import EngineInvitation
    from padel_app.models.players import Player
    from padel_app.services.engine_entry import respond_to_invitation

    row = EngineInvitation.query.filter_by(lesson_instance_id=int(session), player_id=int(student)).one()
    user_id = db.session.get(Player, int(student)).user_id
    return respond_to_invitation(row.id, "yes" if yes else "no", user_id, now=at)


def _left(session, student) -> bool:
    p = _presence(session, student)
    return p.status == "absent" and p.left_reason == "regular_no"


@pytest.mark.criterion("NOTIFICATIONS-ENGINE-STORE-38")
def test_a_no_on_a_class_with_notifications_off_invites_nobody(env):
    store, (session,), (regular, *_) = _class(env, notifications=False)
    _regular_says_no(session, regular)

    assert _left(session, regular)                              # the request's own effect lands
    assert regular not in {p.student for p in store.snapshot(session).going}
    assert _invited(session) == set()
    assert _outbox_to_others(session, regular) == []


@pytest.mark.criterion("NOTIFICATIONS-ENGINE-STORE-39")
def test_a_no_on_a_private_lesson_invites_nobody(env):
    store, (session,), (regular, *_) = _class(env, private=True)
    inst = _instance(session)
    assert inst.auto_invites is None and inst.lesson.auto_invites is None     # inherited: off by type
    _regular_says_no(session, regular)

    assert _left(session, regular)
    assert _invited(session) == set()
    assert _outbox_to_others(session, regular) == []


@pytest.mark.criterion("NOTIFICATIONS-ENGINE-STORE-40")
def test_a_no_with_the_coachs_switch_off_invites_nobody(env):
    store, (session,), (regular, *_) = _class(env, auto_notify=False)
    _regular_says_no(session, regular)

    assert _left(session, regular)
    assert _invited(session) == set()
    assert _outbox_to_others(session, regular) == []


@pytest.mark.criterion("NOTIFICATIONS-ENGINE-STORE-41")
def test_after_the_switch_goes_off_a_no_invites_nobody_and_a_yes_takes_the_seat(env):
    store, (session,), (regular, *others) = _class(env)
    _regular_says_no(session, regular)
    first = _invited(session)
    assert len(first) >= 2 and set(others) - first, "the control needs invitees and students still left"

    inst = _instance(session)
    inst.notifications_enabled = False
    db.session.commit()

    no, yes = sorted(first, key=int)[:2]
    _answer(session, no, False, AT + timedelta(minutes=5))
    assert _invited(session) == first                           # no next invitation after the No

    assert _answer(session, yes, True, AT + timedelta(minutes=10))["action"] == "confirmed"
    assert yes in {p.student for p in store.snapshot(session).going}
    assert _invited(session) == first


@pytest.mark.criterion("NOTIFICATIONS-ENGINE-STORE-42")
def test_with_every_switch_on_a_no_invites(env):
    store, (session,), (regular, *_) = _class(env)
    _regular_says_no(session, regular)

    assert _left(session, regular)
    assert _invited(session)
    assert any(kind == "Invited" for kind, _ in _outbox_to_others(session, regular))


@pytest.mark.criterion("NOTIFICATIONS-ENGINE-STORE-43")
def test_the_coachs_invitation_by_hand_still_goes(env):
    from padel_app.models import EngineEffect
    from padel_app.services.engine_entry import coach_invites

    store, (session,), (regular, chosen, *_) = _class(env, notifications=False)
    _regular_says_no(session, regular)                           # a left seat opens: the chosen student's side
    sent, refused = coach_invites(_instance(session), [int(chosen)], AT + timedelta(minutes=5))

    assert sent == [int(chosen)] and refused == {}
    assert _invited(session) == {chosen}
    row = EngineEffect.query.filter_by(lesson_instance_id=int(session), kind="Invited",
                                       player_id=int(chosen)).one()
    assert row.dispatched_at is not None                         # sent through the outbox


@pytest.mark.criterion("NOTIFICATIONS-ENGINE-STORE-44")
def test_a_replan_of_a_class_with_notifications_off_sends_nothing(env):
    from padel_app.services.engine_entry import replan

    store, (session,), _ = _class(env, notifications=False)
    assert replan([session], AT) == []
    assert _invited(session) == set()


@pytest.mark.criterion("NOTIFICATIONS-ENGINE-STORE-45")
def test_plans_and_the_listing_read_the_same_switches(env):
    from padel_app.models.notification_config import NotificationConfig

    starts = tuple(START + timedelta(hours=2 * n) for n in range(6))
    store, sessions, _ = _class(env, starts=starts)
    # Each class one combination of its own switches (the coach's is swept below).
    combos = [(True, None, "academy"), (False, None, "academy"), (True, False, "academy"),
              (True, None, "private"), (True, True, "private"), (False, True, "academy")]
    for s, (notifications, auto, kind) in zip(sessions, combos):
        inst = _instance(s)
        inst.notifications_enabled, inst.auto_invites = notifications, auto
        inst.lesson.type = kind
    db.session.commit()

    config = NotificationConfig.query.filter_by(coach_id=store.coach_of(sessions[0])).one()
    seen = []
    for coach_on in (True, False, None):                         # None: the coach has no stored row
        if coach_on is None:
            db.session.delete(config)
        else:
            config.auto_notify_enabled = coach_on
        db.session.commit()
        listed = set(store.sessions())
        for s in sessions:
            assert store.plans(s) == (s in listed), (coach_on, s)
        seen.append(listed)
    assert seen[0] == {sessions[0], sessions[4]}                 # only the two classes with every switch on
    assert seen[1] == seen[2] == set()
