"""calendar.view rule 25: "confirmed" on a class means coming, not marked present.

`confirmedCount` counts the presences that are not absent and are either marked present by the coach
or answered yes (`confirmed`). One table of rows (frontend/packages/config/src/confirmed-spots.cases.json)
is read by this file and by capacity.test.ts, so the server and `confirmedSpotsOf` cannot drift.
"""
import json
import pathlib
from datetime import datetime, timedelta
from unittest.mock import patch

import pytest

from padel_app.sql_db import db

CASES = json.loads(
    (
        pathlib.Path(__file__).resolve().parents[3]
        / "frontend" / "packages" / "config" / "src" / "confirmed-spots.cases.json"
    ).read_text(encoding="utf-8")
)

PATCHES = [
    "padel_app.services.notification_service.publish",
    "padel_app.services.notification_service.send_push_notification",
    "padel_app.services.system_messages.publish",
    "padel_app.services.system_messages.send_push_notification",
]


def _seed_class(app, n_players):
    """A coach, an upcoming one-off class (4 days out) and `n_players` enrolled students."""
    from padel_app.models.Association_CoachClub import Association_CoachClub
    from padel_app.models.Association_CoachLesson import Association_CoachLesson
    from padel_app.models.Association_CoachPlayer import Association_CoachPlayer
    from padel_app.models.clubs import Club
    from padel_app.models.coaches import Coach
    from padel_app.models.lessons import Lesson
    from padel_app.models.players import Player
    from padel_app.models.users import User
    from padel_app.services.lesson_service import enrol, get_or_materialize_instance

    with app.app_context():
        cu = User(name="CMC Coach", username="cmc_coach", email="cmc-coach@test.com", password="x", status="active")
        db.session.add(cu)
        db.session.flush()
        coach = Coach(user_id=cu.id)
        db.session.add(coach)
        club = Club(name="CMC Club", description="", location="Test City")
        db.session.add(club)
        db.session.flush()
        db.session.add(Association_CoachClub(coach_id=coach.id, club_id=club.id))
        players = []
        for i in range(n_players):
            u = User(name=f"CMC Student {i}", username=f"cmc_student_{i}", email=f"cmc{i}@test.com", password="x", status="active")
            db.session.add(u)
            db.session.flush()
            p = Player(user_id=u.id)
            db.session.add(p)
            db.session.flush()
            db.session.add(Association_CoachPlayer(coach_id=coach.id, player_id=p.id))
            players.append((p.id, u.id))
        start = (datetime.utcnow() + timedelta(days=4)).replace(hour=9, minute=0, second=0, microsecond=0)
        lesson = Lesson(
            title="CMC Class", start_datetime=start, end_datetime=start + timedelta(hours=1),
            is_recurring=False, type="academy", max_players=8, status="active", club_id=club.id,
        )
        db.session.add(lesson)
        db.session.flush()
        db.session.add(Association_CoachLesson(coach_id=coach.id, lesson_id=lesson.id))
        db.session.commit()
        instance = get_or_materialize_instance(lesson, start.date())
        db.session.commit()
        for pid, _uid in players:
            enrol(pid, instance, "coach")
        db.session.commit()
        return {"coach_id": coach.id, "instance_id": instance.id, "date": start.date(), "players": players}


def _write(app, instance_id, player_id, **cols):
    from padel_app.models.presences import Presence

    with app.app_context():
        row = Presence.query.filter_by(lesson_instance_id=instance_id, player_id=player_id).one()
        for k, v in cols.items():
            setattr(row, k, v)
        db.session.commit()


def _counts(app, ids):
    """(confirmed_spots, effective_filled_spots, calendar event confirmedCount, participantCount)."""
    from padel_app.models.coaches import Coach
    from padel_app.models.lesson_instances import LessonInstance
    from padel_app.services.lesson_service import get_lesson_instances_in_range

    with app.app_context():
        inst = LessonInstance.query.get(ids["instance_id"])
        day = ids["date"]
        coach = Coach.query.get(ids["coach_id"])
        events = get_lesson_instances_in_range(
            coach, datetime.combine(day - timedelta(days=1), datetime.min.time()), datetime.combine(day + timedelta(days=1), datetime.max.time())
        )
        ev = [e for e in events if e.get("title") == "CMC Class" and e.get("date") == day.isoformat()][0]
        return inst.confirmed_spots, inst.effective_filled_spots, ev["confirmedCount"], ev["participantCount"]


@pytest.mark.criterion("CALENDAR-VIEW-30")
def test_confirmed_count_is_who_is_coming(app):
    """Seven students: yes, declined, cancelled, unanswered, validated present, validated absent, present with the validation undone."""
    ids = _seed_class(app, 7)
    iid = ids["instance_id"]
    yes, declined, cancelled, silent, attended, missed, undone = (p for p, _ in ids["players"])
    _write(app, iid, yes, confirmed=True)
    _write(app, iid, declined, confirmed=True, status="absent")  # a decline writes `confirmed` too
    _write(app, iid, cancelled, confirmed=True, status="absent", response="cancelled")
    _write(app, iid, attended, status="present", validated=True, confirmed=True)
    _write(app, iid, missed, status="absent", validated=True)
    _write(app, iid, undone, status="present", validated=False, confirmed=False)  # the coach's mark, validation undone
    confirmed, filled, event_confirmed, event_filled = _counts(app, ids)
    assert (confirmed, event_confirmed) == (3, 3)  # yes + validated present + undone present
    assert filled == event_filled == 4  # yes, silent, attended, undone
    assert confirmed <= filled


@pytest.mark.criterion("CALENDAR-VIEW-31")
def test_a_vou_reaches_the_count(app):
    """The real reminder answer: Vou makes the student confirmed, Não vou takes the spot back."""
    from padel_app.services.notification_service import respond_to_reminder, send_class_reminders

    ids = _seed_class(app, 1)
    (pid, uid), = ids["players"]
    iid = ids["instance_id"]
    assert _counts(app, ids)[2:] == (0, 1)
    with app.app_context(), patch(PATCHES[0]), patch(PATCHES[1]), patch(PATCHES[2]), patch(PATCHES[3]):
        now = datetime.utcnow()
        send_class_reminders(iid, now=now)
        respond_to_reminder(iid, "yes", uid, now=now)
    assert _counts(app, ids)[2:] == (1, 1)
    with app.app_context(), patch(PATCHES[0]), patch(PATCHES[1]), patch(PATCHES[2]), patch(PATCHES[3]):
        respond_to_reminder(iid, "no", uid, now=datetime.utcnow())
    assert _counts(app, ids)[2:] == (0, 0)


@pytest.mark.criterion("CALENDAR-VIEW-32")
def test_every_row_matches_the_shared_table(app):
    ids = _seed_class(app, len(CASES))
    for (pid, _uid), case in zip(ids["players"], CASES):
        _write(app, ids["instance_id"], pid, status=case["status"], confirmed=case["confirmed"], validated=case["validated"])
    confirmed, filled, event_confirmed, _ = _counts(app, ids)
    expected = sum(1 for c in CASES if c["counts"])
    assert confirmed == event_confirmed == expected
    assert confirmed <= filled
    # row by row: one class per row would be slow; the sum above plus these single-row sums pin each row's verdict
    for (pid, _uid), case in zip(ids["players"], CASES):
        _write(app, ids["instance_id"], pid, status="absent", confirmed=False, validated=False)
    for (pid, _uid), case in zip(ids["players"], CASES):
        _write(app, ids["instance_id"], pid, status=case["status"], confirmed=case["confirmed"], validated=case["validated"])
        assert _counts(app, ids)[0] == (1 if case["counts"] else 0), case
        _write(app, ids["instance_id"], pid, status="absent", confirmed=False, validated=False)
