"""notifications.engine-store rules 10 and 11 (owner, 2026-11-19: the switch keeps what the old engine left).

Rule 10: adopting a session takes its people as the old engine left them: an early No stays an absence and
its seat is the engine's, a one-off student's cancellation stays one, the class's lists and requests stay.
Rule 11: a placement from a standing row spends its credit (waiting-list rules 15, 15a on the new engine).
"""
from datetime import timedelta
from unittest.mock import patch

import pytest

from padel_app.sql_db import db
from padel_app.tests.test_engine_switch import LATER, NOW, QUIET, _instance
from padel_app.tests.test_pad916_engine_store import START, _seed


@pytest.fixture(autouse=True)
def _context(app, monkeypatch):
    from padel_app.tests.helpers import pin_clock

    with app.app_context():
        patches = [patch(target) for target in QUIET]
        for p in patches:
            p.start()
        pin_clock(monkeypatch, NOW)
        yield
        for p in patches:
            p.stop()


def _switchable(app, *, starts=(LATER,), players=3, capacity=4, auto_entry=False):
    """A coach on the old engine whose occurrences existed before the (pinned) switch and whose invitation
    windows (24 h before) have not opened; attendance requests 48 h before (the default)."""
    from padel_app.models import EngineSession
    from padel_app.models.notification_config import NotificationConfig

    store, sessions, pids = _seed(app, starts=starts, players=players, capacity=capacity)
    coach_id = store.coach_of(sessions[0])
    EngineSession.query.delete()
    for session in sessions:
        _instance(session).created_at = NOW - timedelta(days=1)
    config = NotificationConfig(coach_id=coach_id, auto_notify_enabled=True)
    config.invitation_start_timing = {"type": "hours_before", "value": 24}
    config.auto_entry_before_attendance_request = auto_entry
    db.session.add(config)
    db.session.commit()
    return coach_id, sessions, [int(p) for p in pids]


def _presence(session, pid):
    from padel_app.models.presences import Presence

    return Presence.query.filter_by(lesson_instance_id=int(session), player_id=pid).one()


def _tick(at, monkeypatch):
    from padel_app.services.engine_runner import tick_sessions
    from padel_app.tests.helpers import pin_clock

    pin_clock(monkeypatch, at)
    effects = tick_sessions(at)
    db.session.expire_all()
    return effects


def _snapshot(session, at):
    from padel_app.services.engine_store import TableStore

    return TableStore(clock=lambda: at).snapshot(str(session))


def _standing(coach_id, pid, credits):
    from padel_app.services.notification_service import add_standing_waiting_list_entry

    return add_standing_waiting_list_entry(coach_id, pid, credits, expires_at=LATER + timedelta(days=30)).id


@pytest.mark.criterion("NOTIFICATIONS-ENGINE-STORE-15")
def test_a_regulars_early_no_survives_the_switch(app, monkeypatch):
    from padel_app.invitation_engine import effects as fx
    from padel_app.models import ReminderAttempt
    from padel_app.models.Association_PlayerLesson import Association_PlayerLesson
    from padel_app.models.vacancy import Vacancy
    from padel_app.services.engine_switch import engine_for, switch_coach
    from padel_app.services.lesson_service import enrol
    from padel_app.services.notification_service import _ensure_vacancy_for_player

    coach_id, (session,), (absent, other, invitee) = _switchable(app, capacity=2)
    inst = _instance(session)
    db.session.add(Association_PlayerLesson(player_id=other, lesson_id=inst.lesson_id))   # a second regular
    enrol(other, inst, "roster")
    # The regular's early No, as the old engine writes it (_free_spot_for_declining_player), and its spot.
    p = _presence(session, absent)
    p.confirmed, p.status, p.justification, p.response = True, "absent", "justified", "proactive_decline"
    db.session.commit()
    _ensure_vacancy_for_player(inst, coach_id, absent)

    switch_coach(coach_id, now=NOW)
    db.session.expire_all()

    assert engine_for(_instance(session)) == "new"
    p = _presence(session, absent)
    assert (p.status, p.response, p.justification, p.left_reason) == (
        "absent", "proactive_decline", "justified", "regular_no")
    assert [v.status for v in Vacancy.query.filter_by(lesson_instance_id=inst.id)] == ["expired"]
    snap = _snapshot(session, NOW)
    assert str(absent) in snap.absent and snap.placement(str(absent)) is None
    assert {r.id for r in snap.regulars} == {str(absent), str(other)}

    effects = []
    for at in (LATER - timedelta(hours=47), LATER - timedelta(hours=23), LATER - timedelta(hours=10),
               LATER - timedelta(hours=1)):
        effects += _tick(at, monkeypatch)
    invited = {e.student for e in effects if isinstance(e, fx.Invited)}
    asked = {e.student for e in effects if isinstance(e, fx.AttendanceRequested)}
    assert str(invitee) in invited                      # the seat the No freed is the engine's to fill
    assert str(other) in asked                          # attendance requests do go out
    assert str(absent) not in asked | invited
    assert ReminderAttempt.query.filter_by(lesson_instance_id=inst.id, player_id=absent).count() == 0


@pytest.mark.criterion("NOTIFICATIONS-ENGINE-STORE-16")
def test_the_coachs_recorded_absence_is_kept_at_the_switch(app):
    from padel_app.services.engine_switch import switch_coach

    coach_id, (session,), (regular, _, _) = _switchable(app)
    p = _presence(session, regular)
    p.status, p.validated, p.justification = "absent", True, "unjustified"      # the coach's own record
    db.session.commit()

    switch_coach(coach_id, now=NOW)
    db.session.expire_all()

    p = _presence(session, regular)
    assert (p.status, p.validated, p.justification, p.left_reason) == ("absent", True, "unjustified", "regular_no")
    snap = _snapshot(session, NOW)
    assert str(regular) in snap.absent and snap.placement(str(regular)) is None


@pytest.mark.criterion("NOTIFICATIONS-ENGINE-STORE-17")
def test_a_cancellation_and_the_classs_lists_survive_the_switch(app):
    from padel_app.models.class_join_request import ClassJoinRequest
    from padel_app.models.waiting_list_entry import WaitingListEntry
    from padel_app.services.engine_switch import switch_coach
    from padel_app.services.lesson_service import enrol

    coach_id, (session,), (_, one_off, standing, own, requester) = _switchable(app, players=5)
    inst = _instance(session)
    p = enrol(one_off, inst, "coach")                   # placed for this class only, then cancelled
    p.confirmed, p.status, p.justification = True, "absent", "justified"
    _standing(coach_id, standing, 2)
    db.session.add(WaitingListEntry(lesson_instance_id=inst.id, player_id=own, coach_id=coach_id,
                                    added_by="student", joined_at=NOW - timedelta(hours=2)))
    request = ClassJoinRequest(lesson_instance_id=inst.id, player_id=requester, coach_id=coach_id,
                               status="pending", created_at=NOW - timedelta(hours=1))
    db.session.add(request)
    db.session.commit()

    switch_coach(coach_id, now=NOW)
    db.session.expire_all()

    p = _presence(session, one_off)
    assert (p.status, p.left_reason) == ("absent", "cancel")
    snap = _snapshot(session, NOW)
    assert snap.placement(str(one_off)) is None
    assert {w.student for w in snap.waiting_list} == {str(standing), str(own)}
    assert {w.player_id for w in WaitingListEntry.query.filter_by(lesson_instance_id=inst.id, is_active=True)} == {
        standing, own}
    assert db.session.get(ClassJoinRequest, request.id).status == "pending"


@pytest.mark.criterion("NOTIFICATIONS-ENGINE-STORE-18")
def test_a_yes_from_a_standing_row_spends_its_credit(app, monkeypatch):
    from padel_app.invitation_engine import effects as fx
    from padel_app.invitation_engine import requests as rq
    from padel_app.models.standing_waiting_list_entry import StandingWaitingListEntry
    from padel_app.models.waiting_list_entry import WaitingListEntry
    from padel_app.services.engine_entry import handle
    from padel_app.services.engine_store import TableStore
    from padel_app.services.engine_switch import switch_coach
    from padel_app.tests.helpers import pin_clock

    coach_id, (here, other), (_, student, _) = _switchable(app, starts=(LATER, LATER + timedelta(days=1)))
    entry_id = _standing(coach_id, student, 1)
    switch_coach(coach_id, now=NOW)

    at = LATER - timedelta(hours=23)
    assert any(isinstance(e, fx.Invited) and e.student == str(student) for e in _tick(at, monkeypatch))
    pin_clock(monkeypatch, at + timedelta(minutes=1))
    effects = handle(_instance(here), rq.Answer(str(student), True), at + timedelta(minutes=1))
    placed = [e for e in effects if isinstance(e, fx.Placed) and e.student == str(student)]
    assert placed and _presence(here, student).status is None

    entry = db.session.get(StandingWaitingListEntry, entry_id)
    assert (entry.credits_used, entry.is_active) == (1, False)
    assert WaitingListEntry.query.filter_by(lesson_instance_id=int(other), player_id=student,
                                            is_active=True).count() == 0

    store = TableStore(clock=lambda: at)
    with store.unit((here,)):
        store.apply(placed)                             # rule 1: an effect applied again spends nothing
    db.session.expire_all()
    assert db.session.get(StandingWaitingListEntry, entry_id).credits_used == 1


@pytest.mark.criterion("NOTIFICATIONS-ENGINE-STORE-19")
def test_automatic_entry_no_limit_and_a_coachs_accept_spend_as_rule_11_says(app, monkeypatch):
    from padel_app.invitation_engine import effects as fx
    from padel_app.models.class_join_request import ClassJoinRequest
    from padel_app.models.coaches import Coach
    from padel_app.models.standing_waiting_list_entry import StandingWaitingListEntry
    from padel_app.services.class_join_request_service import decide_join_request_service
    from padel_app.services.engine_switch import switch_coach

    coach_id, (session,), (_, counted, unlimited, requester) = _switchable(app, players=4, capacity=6,
                                                                            auto_entry=True)
    two = _standing(coach_id, counted, 2)
    no_limit = _standing(coach_id, unlimited, None)
    switch_coach(coach_id, now=NOW)

    placed = {e.student: e.how for e in _tick(NOW + timedelta(hours=1), monkeypatch) if isinstance(e, fx.Placed)}
    assert placed == {str(counted): "auto_from_waiting_list", str(unlimited): "auto_from_waiting_list"}
    entry = db.session.get(StandingWaitingListEntry, two)
    assert (entry.credits_used, entry.credits_total, entry.is_active) == (1, 2, True)
    entry = db.session.get(StandingWaitingListEntry, no_limit)
    assert (entry.credits_used, entry.credits_total, entry.is_active) == (1, None, True)

    accepted = _standing(coach_id, requester, 2)
    request = ClassJoinRequest(lesson_instance_id=int(session), player_id=requester, coach_id=coach_id,
                               status="pending", created_at=NOW + timedelta(hours=1))
    db.session.add(request)
    db.session.commit()
    decide_join_request_service(request.id, db.session.get(Coach, coach_id), accept=True, confirm=True,
                                now=NOW + timedelta(hours=2))
    db.session.expire_all()
    assert db.session.get(ClassJoinRequest, request.id).status == "accepted"
    assert db.session.get(StandingWaitingListEntry, accepted).credits_used == 1
