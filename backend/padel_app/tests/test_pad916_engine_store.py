"""PAD-916: the new engine's table-backed store (services/engine_store.py, swap plan §5).

The 133 scenarios run through it with ``INVITATION_ENGINE=new INVITATION_STORE=db``; these pin what
the scenarios cannot see: an effect applied twice is written once, the outbox sends each message
once, one invitation per student per session (D1), never two sessions at one hour whatever path
places the student (engine-answers rule 10), and what the waiting-list table cannot hold.
"""
from datetime import datetime, timedelta

import pytest

from padel_app.invitation_engine import effects as fx
from padel_app.invitation_engine.snapshot import SpotType, Student
from padel_app.sql_db import db

@pytest.fixture(autouse=True)
def _context(app):
    with app.app_context():
        yield


NOW = datetime(2026, 11, 1, 18, 0)
START = datetime(2026, 11, 1, 20, 0)          # Lisbon wall-clock; winter, so UTC too


def _seed(app, starts=(START,), players=3, side="left", capacity=4):
    """One coach with a level-3 rung, ``players`` students, one occurrence per start; the first
    student is the regular of every occurrence, on the left; the others play ``side``. Returns (store, session ids, player ids)."""
    from padel_app.models import User
    from padel_app.models.Association_CoachLessonInstance import Association_CoachLessonInstance
    from padel_app.models.Association_CoachPlayer import Association_CoachPlayer
    from padel_app.models.Association_PlayerLesson import Association_PlayerLesson
    from padel_app.models.clubs import Club
    from padel_app.models.coach_levels import CoachLevel
    from padel_app.models.coaches import Coach
    from padel_app.models.lesson_instances import LessonInstance
    from padel_app.models.lessons import Lesson
    from padel_app.models.players import Player
    from padel_app.services.engine_store import TableStore

    cu = User(name="Coach", username="c916", password="x", status="active")
    db.session.add(cu)
    db.session.flush()
    coach = Coach(user_id=cu.id)
    club = Club(name="Club", description="", location="Lisboa")
    db.session.add_all([coach, club])
    db.session.flush()
    level = CoachLevel(coach_id=coach.id, label="N3", code="N3", display_order=3)
    db.session.add(level)
    db.session.flush()
    pids = []
    for n in range(players):
        u = User(name=f"S{n}", username=f"s916_{n}", password="x", status="active")
        db.session.add(u)
        db.session.flush()
        p = Player(user_id=u.id)
        db.session.add(p)
        db.session.flush()
        db.session.add(Association_CoachPlayer(coach_id=coach.id, player_id=p.id, level_id=level.id,
                                                side="left" if not pids else side))
        pids.append(str(p.id))
    sessions = []
    for start in starts:
        lesson = Lesson(title="C", start_datetime=start, end_datetime=start + timedelta(hours=1), is_recurring=False,
                        type="academy", max_players=capacity, color="#000", status="active", club_id=club.id,
                        default_level_id=level.id)
        db.session.add(lesson)
        db.session.flush()
        inst = LessonInstance(lesson_id=lesson.id, start_datetime=start, end_datetime=start + timedelta(hours=1),
                              max_players=capacity, status="scheduled", level_id=level.id)
        db.session.add(inst)
        db.session.flush()
        db.session.add(Association_CoachLessonInstance(coach_id=coach.id, lesson_instance_id=inst.id))
        db.session.add(Association_PlayerLesson(player_id=int(pids[0]), lesson_id=lesson.id))
        sessions.append(str(inst.id))
    db.session.commit()
    store = TableStore(clock=lambda: NOW)
    for sid in sessions:
        with store.unit((sid,)):
            store.add_session(sid, 3, capacity, START, [(Student(pids[0], 3, frozenset({"L"})), "L")], NOW)
    return store, sessions, pids


def _invited(session, student, at=NOW):
    return fx.Invited(session, at, student, frozenset({SpotType("L", 3)}), "L", 0, at + timedelta(minutes=20))


def test_snapshot_reads_what_apply_wrote(app):
    store, (a,), (reg, x, y) = _seed(app)
    with store.unit((a,)):
        store.apply([_invited(a, x), _invited(a, y), fx.Answered(a, NOW, x, "yes", "invitation"),
                     fx.Placed(a, NOW, x, "L", "invitation"), fx.Answered(a, NOW, y, "no", "invitation")])
    s = store.snapshot(a)
    assert {p.student: (p.side, p.how) for p in s.going} == {reg: ("L", "regular"), x: ("L", "invitation")}
    assert [i.student for i in s.invitations] == [x, y]
    assert s.said_no == {y} and not s.open_invitations
    assert {st.id for st in s.pool} == {y}                                 # x is in the session now
    with store.unit((a,)):
        store.apply([fx.Absence(a, NOW, reg, "on_time"), fx.Left(a, NOW, reg, "regular_no")])
    s = store.snapshot(a)
    assert s.absent == {reg} and reg not in {p.student for p in s.going} and reg in {r.id for r in s.regulars}


def test_an_effect_applied_twice_is_written_once(app):
    from padel_app.models import EngineEffect, EngineInvitation

    store, (a,), (_, x, _) = _seed(app)
    batch = [_invited(a, x), fx.AttendanceRequested(a, NOW, x)]
    with store.unit((a,)):
        store.apply(batch)
    with store.unit((a,)):
        store.apply(batch)                                              # a retried apply
    assert EngineInvitation.query.count() == 1
    assert EngineEffect.query.count() == 2


def test_the_outbox_sends_each_message_once(app):
    from padel_app.services.engine_store import dispatch

    store, (a,), (_, x, y) = _seed(app)
    with store.unit((a,)):
        store.apply([_invited(a, x), _invited(a, y), fx.Message(a, NOW, x, "sorry"),
                     fx.Answered(a, NOW, y, "no", "invitation")])           # not a message
    sent = []
    assert dispatch(lambda row: sent.append((row.kind, row.player_id)), now=NOW) == 3
    assert dispatch(lambda row: sent.append((row.kind, row.player_id)), now=NOW) == 0
    assert sorted(sent) == sorted([("Invited", int(x)), ("Invited", int(y)), ("Message", int(x))])


def test_a_second_invitation_for_one_student_is_refused(app):
    from padel_app.services.engine_store import StoreConflict

    store, (a,), (_, x, _) = _seed(app)
    with store.unit((a,)):
        store.apply([_invited(a, x)])
    with pytest.raises(StoreConflict), store.unit((a,)):
        store.apply([_invited(a, x, NOW + timedelta(minutes=5))])


def test_a_placement_at_an_hour_the_student_is_going_elsewhere_rolls_back(app):
    from padel_app.models.presences import Presence
    from padel_app.services.engine_store import SameHourConflict

    store, (a, b), (_, x, _) = _seed(app, starts=(START, START))
    with store.unit((a,)):
        store.apply([fx.Placed(a, NOW, x, "L", "invitation")])
    with pytest.raises(SameHourConflict), store.unit((b,)):
        store.apply([fx.Placed(b, NOW, x, "L", "auto_from_waiting_list")])
    assert Presence.query.filter_by(lesson_instance_id=int(b), player_id=int(x)).first() is None
    assert x in store.snapshot(b).busy_same_time


def test_both_waiting_lists_at_once_is_a_named_conflict(app):
    from padel_app.services.engine_store import StoreConflict

    store, (a,), (_, x, _) = _seed(app)
    with store.unit((a,)):
        store.apply([fx.WaitingListJoined(a, NOW, x, "coach", "L")])
    with pytest.raises(StoreConflict), store.unit((a,)):
        store.apply([fx.WaitingListJoined(a, NOW, x, "students", None, "own")])
    s = store.snapshot(a)
    assert [(w.student, w.list, w.side) for w in s.waiting_list] == [(x, "coach", "L")]




def test_a_no_is_the_students_cancellation_and_the_coach_judges_the_absence(app):
    """Owner ruling D4: the store writes the student's No as ``cancelled`` at the effect's time, so the
    app's ``presence_late_cancellation`` agrees with the engine's notice when the two cutoffs agree; it
    never writes ``justification``. A no-show and an automatic entrant's No record no response."""
    from padel_app.models.notification_config import NotificationConfig
    from padel_app.models.presences import Presence
    from padel_app.services.presence_response import presence_late_cancellation

    store, (a,), (reg, x, auto, gone) = _seed(app, players=4)
    config = NotificationConfig(coach_id=store.coach_of(a), cancellation_deadline_hours=12)   # = the engine's cutoff
    db.session.add(config)
    db.session.commit()
    with store.unit((a,)):
        store.apply([fx.Placed(a, NOW, x, "L", "invitation"), fx.Placed(a, NOW, auto, "L", "auto_from_waiting_list"),
                     fx.Placed(a, NOW, gone, "L", "invitation")])
    on_time, late, after = START - timedelta(hours=13), START - timedelta(hours=1), START + timedelta(hours=1)
    for student, at, notice, reason in ((reg, on_time, "on_time", "regular_no"), (x, late, "late", "cancel"),
                                        (auto, late, "none", "cancel"), (gone, after, "late", "no_show")):
        with store.unit((a,)):
            store.apply([fx.Absence(a, at, student, notice), fx.Left(a, at, student, reason)])
    rows = {str(p.player_id): p for p in Presence.query.filter_by(lesson_instance_id=int(a)).all()}
    assert [(rows[s].response, presence_late_cancellation(rows[s], config=config))
            for s in (reg, x, auto, gone)] == [
        ("cancelled", False), ("cancelled", True), ("none", False), ("none", False)]
    assert {p.justification for p in rows.values()} == {None}
