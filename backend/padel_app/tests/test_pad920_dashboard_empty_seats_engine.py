"""PAD-933 (dashboard.blocks NA5, owner decisions 17 and 18): the coach home's open-spots item and its
schedule row say the class's engine, and a new-engine open-spots item says how many of the engine's
invitations still count, the same count as the class detail's "N pending" (event-detail ND2).

Clocks are pinned; 1 Nov 2026 is a Sunday, so Tuesday's read covers Thursday.
"""
from datetime import datetime, timedelta

import pytest

from padel_app.invitation_engine import effects as fx
from padel_app.invitation_engine.snapshot import SpotType
from padel_app.sql_db import db
from padel_app.tests.test_pad916_engine_store import _seed

TUESDAY = datetime(2026, 11, 3, 10, 0)          # Lisbon wall-clock; winter, so UTC too
THURSDAY = datetime(2026, 11, 5, 20, 0)


@pytest.fixture(autouse=True)
def _context(app):
    with app.app_context():
        yield


def _home(coach_id, user_id):
    from padel_app.helpers.dashboard.coach_home import (
        build_needs_you_block, load_coach_home_events, schedule_block,
    )

    events = load_coach_home_events(coach_id=coach_id, now=TUESDAY)
    items = build_needs_you_block(coach_id=coach_id, user_id=user_id, now=TUESDAY, events=events)["data"]["items"]
    rows = schedule_block(events, invite=True, now=TUESDAY)["data"]["items"]
    return [i for i in items if i["kind"] == "empty_seats"], rows


def _old_engine_class(invitations: int):
    """A second coach, on the old engine: one Thursday class of 4 with nobody in it, and
    ``invitations`` live (sent) invitations to students on the roster."""
    from padel_app.models import NotificationEvent, User
    from padel_app.models.Association_CoachLessonInstance import Association_CoachLessonInstance
    from padel_app.models.Association_CoachPlayer import Association_CoachPlayer
    from padel_app.models.clubs import Club
    from padel_app.models.coaches import Coach
    from padel_app.models.lesson_instances import LessonInstance
    from padel_app.models.lessons import Lesson
    from padel_app.models.players import Player

    cu = User(name="Old", username="c933_old", password="x", status="active")
    db.session.add(cu)
    db.session.flush()
    coach = Coach(user_id=cu.id)
    club = Club(name="Club B", description="", location="Lisboa")
    db.session.add_all([coach, club])
    db.session.flush()
    lesson = Lesson(title="B", start_datetime=THURSDAY, end_datetime=THURSDAY + timedelta(hours=1),
                    is_recurring=False, type="academy", max_players=4, color="#000", status="active",
                    club_id=club.id)
    db.session.add(lesson)
    db.session.flush()
    inst = LessonInstance(lesson_id=lesson.id, start_datetime=THURSDAY, end_datetime=THURSDAY + timedelta(hours=1),
                          max_players=4, status="scheduled")
    db.session.add(inst)
    db.session.flush()
    db.session.add(Association_CoachLessonInstance(coach_id=coach.id, lesson_instance_id=inst.id))
    for n in range(invitations):
        u = User(name=f"B{n}", username=f"s933_b{n}", password="x", status="active")
        db.session.add(u)
        db.session.flush()
        p = Player(user_id=u.id)
        db.session.add(p)
        db.session.flush()
        db.session.add(Association_CoachPlayer(coach_id=coach.id, player_id=p.id))
        db.session.add(NotificationEvent(coach_id=coach.id, lesson_instance_id=inst.id, player_id=p.id,
                                         type="manual", round_number=1, status="sent"))
    db.session.commit()
    return coach, inst


def _new_engine_class(app, counting: int, stopped: int):
    """``_seed``'s coach on the new engine: one Thursday class with ``counting`` invitations that still
    count on Tuesday and ``stopped`` open ones whose time ran out before it."""
    from padel_app.models.coaches import Coach

    store, (thu,), pids = _seed(app, starts=(THURSDAY,), players=1 + counting + stopped)
    sent = TUESDAY - timedelta(hours=2)
    effects = [
        fx.Invited(thu, sent, sid, frozenset({SpotType("L", 3)}), "L", 0,
                   TUESDAY + timedelta(hours=1) if n < counting else TUESDAY - timedelta(hours=1))
        for n, sid in enumerate(pids[1:])
    ]
    with store.unit((thu,)):
        store.apply(effects)
    db.session.commit()
    return db.session.get(Coach, store.coach_of(thu)), thu


@pytest.mark.criterion("DASHBOARD-BLOCKS-58")
def test_an_empty_seats_item_carries_its_engine_and_counting_invitations(app):
    coach_a, thu = _new_engine_class(app, counting=5, stopped=2)
    coach_b, inst_b = _old_engine_class(invitations=3)

    [a], rows_a = _home(coach_a.id, coach_a.user_id)
    assert a["id"] == f"lessoninstance-{thu}"
    assert a["engineVersion"] == "new"
    assert a["pendingInvites"] == 5                     # the two that stopped counting are not pending
    assert [r["engineVersion"] for r in rows_a] == ["new"]

    [b], rows_b = _home(coach_b.id, coach_b.user_id)
    assert b["id"] == f"lessoninstance-{inst_b.id}"
    assert b["engineVersion"] == "old"
    assert "pendingInvites" not in b
    assert [r["engineVersion"] for r in rows_b] == ["old"]


@pytest.mark.criterion("DASHBOARD-BLOCKS-61")
def test_a_schedule_row_carries_its_engine(app):
    coach_a, thu = _new_engine_class(app, counting=1, stopped=0)
    coach_b, inst_b = _old_engine_class(invitations=0)

    _, [row_a] = _home(coach_a.id, coach_a.user_id)
    _, [row_b] = _home(coach_b.id, coach_b.user_id)
    assert (row_a["id"], row_a["engineVersion"]) == (f"lessoninstance-{thu}", "new")
    assert (row_b["id"], row_b["engineVersion"]) == (f"lessoninstance-{inst_b.id}", "old")
