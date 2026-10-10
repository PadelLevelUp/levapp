"""PAD-591 — fixed statement counts on the request paths the PAD-571 study measured.

Each test compares a small seed with a large one under a SQLAlchemy statement recorder
(the PAD-262 / PAD-583 template) and asserts it found its subject (R-032).

Specs: calendar.view rule 19, calendar.event-detail rule 21, attendance.presence rule 10,
attendance.validation rule 27, auth.logout rule 5.
"""
import re
from collections import Counter
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone

import pytest
from flask_jwt_extended import create_access_token
from sqlalchemy import event

from padel_app.sql_db import db


@pytest.fixture(autouse=True)
def _jwt(app):
    app.config["JWT_SECRET_KEY"] = "test-jwt-secret"


def _headers(app, user_id, **kwargs):
    with app.app_context():
        return {"Authorization": f"Bearer {create_access_token(identity=str(user_id), **kwargs)}"}


@contextmanager
def _statements(app):
    with app.app_context():
        engine = db.engine
    recorded = []

    def _record(conn, cursor, statement, parameters, context, executemany):
        if statement.lstrip().upper().startswith("SELECT"):
            recorded.append(statement)

    event.listen(engine, "before_cursor_execute", _record)
    try:
        yield recorded
    finally:
        event.remove(engine, "before_cursor_execute", _record)


def _assert_same_count(small, big, label):
    if len(big) != len(small):
        def _tables(stmts):
            return Counter(m.group(1) for st in stmts for m in [re.search(r"\bFROM\s+([a-z_]+)", st)] if m)

        diff = (_tables(small) - _tables(big)) + (_tables(big) - _tables(small))
        raise AssertionError(f"{label}: {len(small)} statements for the small seed, {len(big)} for the big; "
                             f"differing tables: {dict(diff)}")


def _make_coach(app, tag):
    from padel_app.models import Club, User
    from padel_app.models.Association_CoachClub import Association_CoachClub
    from padel_app.models.coaches import Coach

    with app.app_context():
        user = User(name=f"Coach {tag}", username=f"p591_c_{tag}", password="x", status="active")
        db.session.add(user)
        db.session.flush()
        coach = Coach(user_id=user.id)
        club = Club.query.first() or Club(name="P591 Club", description="d", location="l")
        db.session.add_all([coach, club])
        db.session.flush()
        db.session.add(Association_CoachClub(coach_id=coach.id, club_id=club.id))
        db.session.commit()
        return coach.id, user.id, club.id


def _make_player(app, tag):
    from padel_app.models import User
    from padel_app.models.players import Player

    with app.app_context():
        user = User(name=f"Player {tag}", username=f"p591_p_{tag}", password="x", status="active")
        db.session.add(user)
        db.session.flush()
        player = Player(user_id=user.id)
        db.session.add(player)
        db.session.commit()
        return player.id, user.id


# ---------------------------------------------------------------------------
# Task 1 — calendar.view rule 19
# ---------------------------------------------------------------------------
RANGE_START = datetime(2026, 8, 3, 0, 0, tzinfo=timezone.utc)
RANGE_END = RANGE_START + timedelta(weeks=6)


def _coach_with_lessons(app, *, tag, in_range, past):
    """A coach with `in_range` one-off lessons (each with 2 enrolled players) inside the
    6-week range and `past` one-off lessons in the year before it."""
    from padel_app.models import Association_CoachLesson, Association_PlayerLesson
    from padel_app.models.lessons import Lesson

    coach_id, user_id, club_id = _make_coach(app, tag)
    players = [_make_player(app, f"{tag}{n}")[0] for n in range(2)]
    ids = {"in": [], "past": []}
    with app.app_context():
        def lesson(title, start):
            row = Lesson(title=title, start_datetime=start, end_datetime=start + timedelta(hours=1),
                         is_recurring=False, type="academy", max_players=4, status="active", club_id=club_id)
            db.session.add(row)
            db.session.flush()
            db.session.add(Association_CoachLesson(coach_id=coach_id, lesson_id=row.id))
            for pid in players:
                db.session.add(Association_PlayerLesson(player_id=pid, lesson_id=row.id))
            return row.id

        base = RANGE_START.replace(tzinfo=None)
        for i in range(in_range):
            ids["in"].append(lesson(f"{tag} in {i}", base + timedelta(days=1 + i * 3, hours=9)))
        for i in range(past):
            ids["past"].append(lesson(f"{tag} past {i}", base - timedelta(days=10 + i * 15, hours=-9)))
        db.session.commit()
    return user_id, ids, len(players)


def _calendar(app, client, user_id):
    return client.get(
        "/api/app/calendar",
        query_string={"from": RANGE_START.isoformat(), "to": RANGE_END.isoformat()},
        headers=_headers(app, user_id),
    )


def test_a_coach_calendar_costs_a_fixed_number_of_statements(app, client):
    small_user, small_ids, roster = _coach_with_lessons(app, tag="small", in_range=3, past=20)
    big_user, big_ids, _ = _coach_with_lessons(app, tag="big", in_range=13, past=20)

    with _statements(app) as small:
        small_resp = _calendar(app, client, small_user)
    with _statements(app) as big:
        big_resp = _calendar(app, client, big_user)

    assert small_resp.status_code == 200 and big_resp.status_code == 200
    # R-032: each response holds its own in-range lessons, and no past lesson.
    for resp, ids in ((small_resp, small_ids), (big_resp, big_ids)):
        events = resp.get_json()
        assert len(events) == len(ids["in"])
        assert all(e["type"] == "class" for e in events)
        assert all(e["participantCount"] == roster for e in events)
        shown = {str(e["id"]) for e in events}
        assert not shown & {str(i) for i in ids["past"]}
    _assert_same_count(small, big, "coach calendar")


def test_the_loaders_leave_out_past_one_off_lessons_but_keep_recurring_series(app):
    import json

    from padel_app.helpers.calendar_helpers import load_lessons_for_coach, load_lessons_for_player
    from padel_app.models import Association_CoachLesson, Association_PlayerLesson, Club
    from padel_app.models.lessons import Lesson

    user_id, ids, _ = _coach_with_lessons(app, tag="loader", in_range=2, past=4)
    player_id, _pu = _make_player(app, "loader_student")
    with app.app_context():
        from padel_app.models.coaches import Coach

        coach_id = Coach.query.filter_by(user_id=user_id).one().id
        past = RANGE_START.replace(tzinfo=None) - timedelta(days=200)
        series = Lesson(title="old open series", start_datetime=past, end_datetime=past + timedelta(hours=1),
                        is_recurring=True, recurrence_rule=json.dumps({"frequency": "weekly", "daysOfWeek": [1]}),
                        type="academy", max_players=4, status="active", club_id=Club.query.first().id)
        db.session.add(series)
        db.session.flush()
        db.session.add(Association_CoachLesson(coach_id=coach_id, lesson_id=series.id))
        db.session.add(Association_PlayerLesson(player_id=player_id, lesson_id=series.id))
        for lid in ids["in"] + ids["past"]:
            db.session.add(Association_PlayerLesson(player_id=player_id, lesson_id=lid))
        db.session.commit()
        series_id = series.id

        coach_ids = {l.id for l in load_lessons_for_coach(coach_id, RANGE_START, RANGE_END)}
        player_ids = {l.id for l in load_lessons_for_player(player_id, RANGE_START, RANGE_END)}

    expected = set(ids["in"]) | {series_id}
    assert coach_ids == expected
    assert player_ids == expected
