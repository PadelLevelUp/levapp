"""B-730 (notifications.engine-answers rule 10): a request whose unit loses the store's same-hour race is
run again on the committed state, and answers as if it had arrived just after the other unit. A refusal
that still escapes is a 409 busy_same_hour, never a 500.

The race, staged the way it happens: the request's unit reads the session (a snapshot) before another
unit commits the student's placement in an overlapping class, and applies its own placement after.
The test takes that snapshot first, commits the other unit's writes for real, and hands the stale
snapshot to the request's first read only. The store's guard then sees the real clash and refuses
(`SameHourConflict`), as it would in production.
"""
from dataclasses import replace
from datetime import timedelta

import pytest
from flask_jwt_extended import create_access_token

from padel_app.invitation_engine import effects as fx
from padel_app.invitation_engine.snapshot import SpotType
from padel_app.sql_db import db
from padel_app.tests.helpers import pin_clock
from padel_app.tests.test_pad916_engine_store import NOW, START, _seed

LATER = START + timedelta(days=3)          # far enough out that automatic entry still runs


@pytest.fixture(autouse=True)
def _context(app, monkeypatch):
    from padel_app.utils import expo_push, push_notifications

    app.config["JWT_SECRET_KEY"] = "test-secret"
    monkeypatch.setattr(push_notifications, "send_push_notification", lambda **kw: None)
    monkeypatch.setattr(expo_push, "send_expo_push_to_user", lambda *a, **k: None)
    pin_clock(monkeypatch, NOW)


def _stale_first_read(monkeypatch, session, stale):
    """The request's first read of ``session`` is ``stale`` (taken before the other unit committed)."""
    from padel_app.services.engine_store import TableStore

    real, served = TableStore.snapshot, []

    def snapshot(self, sid):
        if str(sid) == str(session) and not served:
            served.append(sid)
            return stale
        return real(self, sid)

    monkeypatch.setattr(TableStore, "snapshot", snapshot)
    return served


def _count_units(monkeypatch):
    from padel_app.services.engine_store import TableStore

    real, units = TableStore.unit, []

    def unit(self, sessions, students=()):
        units.append(tuple(sessions))
        return real(self, sessions, students)

    monkeypatch.setattr(TableStore, "unit", unit)
    return units


def _going(session, student) -> bool:
    from padel_app.models.presences import Presence

    db.session.expire_all()
    p = Presence.query.filter_by(lesson_instance_id=int(session), player_id=int(student)).first()
    return p is not None and p.status != "absent"


def _respond(client, student, invitation_id):
    from padel_app.models.players import Player

    with client.application.app_context():
        token = create_access_token(identity=str(db.session.get(Player, int(student)).user_id))
    return client.post("/api/app/notify/respond", json={"invitationId": invitation_id, "action": "yes"},
                       headers={"Authorization": f"Bearer {token}"})


def _invited(app, store, session, student):
    """An open, counting invitation of ``student`` to ``session``; its row id."""
    from padel_app.models import EngineInvitation

    level = store.snapshot(session).level
    with store.unit((session,)):
        store.apply([fx.Invited(session, NOW, student, frozenset({SpotType("R", level)}), None, 0,
                                NOW + timedelta(minutes=30))])
    db.session.commit()
    return EngineInvitation.query.filter_by(lesson_instance_id=int(session), player_id=int(student)).one().id


def _coach_added_elsewhere(other, student):
    """The coach's add of the student to ``other``, at its enrolment's commit: the presence is written
    (without the student's lock), and its ``CoachAdded`` has not run yet, so her invitations stay open."""
    from padel_app.models.lesson_instances import LessonInstance
    from padel_app.services.lesson_service import enrol

    enrol(int(student), db.session.get(LessonInstance, int(other)), "coach")
    db.session.commit()


def _placed_elsewhere(store, other, student):
    """The other unit's commit: the student going in ``other``, and their same-hour invitations closed."""
    from padel_app.invitation_engine import planner

    with store.unit((other,), (student,)):
        store.apply([fx.Placed(other, NOW, student, "R", "direct")])
        store.apply(list(planner.close_same_hour(store.snapshot(other), student, NOW)))
    db.session.commit()


@pytest.mark.criterion("NOTIFICATIONS-ENGINE-ANSWERS-33")
def test_a_yes_that_loses_the_race_answers_as_without_it(app, client, monkeypatch):
    with app.app_context():
        store, (s, other), (_, ana) = _seed(app, starts=(START, START), players=2, side="right", capacity=2)
        invitation_id = _invited(app, store, s, ana)
        stale = store.snapshot(s)                              # Ana's Yes reads before the coach's add commits
        _coach_added_elsewhere(other, ana)
    served = _stale_first_read(monkeypatch, s, stale)
    units = _count_units(monkeypatch)

    res = _respond(client, ana, invitation_id)

    assert res.status_code == 200, res.get_json()
    assert res.get_json()["action"] == "sorry"                 # what a Yes from a busy student gets anyway
    assert served and units.count((s,)) == 2                   # refused once, run again on committed state
    with app.app_context():
        assert (_going(other, ana), _going(s, ana)) == (True, False)


@pytest.mark.criterion("NOTIFICATIONS-ENGINE-ANSWERS-33")
def test_a_request_that_loses_another_students_automatic_entry_goes_through(app, monkeypatch):
    from padel_app.models.waiting_list_entry import WaitingListEntry
    from padel_app.services import engine_store
    from padel_app.services.engine_entry import coach_excludes

    real_settings = engine_store.settings_for
    monkeypatch.setattr(engine_store, "settings_for",
                        lambda sid: replace(real_settings(sid), auto_entry_before_attendance_request=True))
    with app.app_context():
        store, (s, other), (_, waiting, excluded) = _seed(app, starts=(LATER, LATER), players=3, side="right",
                                                          capacity=2)
        db.session.add(WaitingListEntry(lesson_instance_id=int(s), player_id=int(waiting),
                                        coach_id=store.coach_of(s), is_active=True, added_by="student",
                                        joined_at=NOW - timedelta(hours=1)))
        db.session.commit()
        stale = store.snapshot(s)                              # the coach's request reads before the other unit
        assert any(w.student == waiting for w in stale.waiting_list)
        _placed_elsewhere(store, other, waiting)
        served = _stale_first_read(monkeypatch, s, stale)
        units = _count_units(monkeypatch)

        from padel_app.models.lesson_instances import LessonInstance
        coach_excludes(db.session.get(LessonInstance, int(s)), int(excluded))      # no 500

        assert served and units.count((s,)) == 2
        assert (_going(other, waiting), _going(s, waiting)) == (True, False)
        from padel_app.models import EngineExclusion
        assert EngineExclusion.query.filter_by(lesson_instance_id=int(s), player_id=int(excluded)).count() == 1


@pytest.mark.criterion("NOTIFICATIONS-ENGINE-ANSWERS-34")
def test_a_refusal_that_keeps_escaping_answers_409_busy_same_hour(app, client, monkeypatch):
    from padel_app.services.engine_store import SameHourConflict, TableStore

    with app.app_context():
        store, (s,), (_, ana) = _seed(app, players=2, side="right", capacity=2)
        invitation_id = _invited(app, store, s, ana)
    guards = []

    def always_refused(self, e):
        guards.append(e.student)
        raise SameHourConflict(f"{e.student} keeps losing")

    monkeypatch.setattr(TableStore, "_guard_same_hour", always_refused)

    res = _respond(client, ana, invitation_id)

    assert res.status_code == 409, res.get_json()
    assert res.get_json() == {"code": "busy_same_hour", "message": "busy same hour", "clashes": []}
    assert guards == [ana] * 3
    with app.app_context():
        assert not _going(s, ana)
