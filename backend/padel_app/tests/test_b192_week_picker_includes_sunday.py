"""
B-192 — the "Add to classes" picker's week includes its Sunday.

Every picker (web `AddToClassesDialog`, iOS `add-to-classes-dialog`, and the App Store
builds already installed) asks `GET /api/app/lesson_instances?from=<Monday>&to=<Sunday>`
with date-only bounds, meaning "through Sunday". The route parsed a date-only `to` as
Sunday 00:00, so every class on the week's Sunday after midnight was left out, and a
coach could not add a player to it. A date-only `to` now means the end of that day,
exactly what the calendar's own clients send (`…T23:59:59`); a full timestamp is
unchanged.

Written red first: on staging 0e40e3a6 the two Sunday cases fail.

Covered spec: players.profile rule 5 and the criterion "The picker offers the week's
Sunday classes (B-192)".
"""
import json
from datetime import date, datetime, timedelta

import pytest
from flask_jwt_extended import create_access_token

from padel_app.sql_db import db

MONDAY = "2026-09-28"
SUNDAY = "2026-10-04"


@pytest.fixture(autouse=True)
def _jwt_secret(app):
    app.config["JWT_SECRET_KEY"] = "test-jwt-secret"


def _setup(app):
    """A coach with: a one-off class Sunday 10:00, a weekly Sunday series (its 4 Oct
    occurrence is virtual), and a one-off class the next Monday at 00:00."""
    from padel_app.models import User
    from padel_app.models.coaches import Coach
    from padel_app.models.clubs import Club
    from padel_app.models.lessons import Lesson
    from padel_app.models.lesson_instances import LessonInstance
    from padel_app.models.Association_CoachLesson import Association_CoachLesson
    from padel_app.models.Association_CoachLessonInstance import (
        Association_CoachLessonInstance,
    )

    with app.app_context():
        user = User(name="Coach", username="b192_coach", password="x")
        db.session.add(user)
        db.session.flush()
        coach = Coach(user_id=user.id)
        club = Club(name="B192 Club", description="c", location="x")
        db.session.add_all([coach, club])
        db.session.flush()

        def lesson(title, start, recurring=False):
            row = Lesson(
                title=title,
                start_datetime=start,
                end_datetime=start + timedelta(hours=1),
                is_recurring=recurring,
                recurrence_rule=json.dumps({"frequency": "weekly", "daysOfWeek": [0]}) if recurring else None,
                recurrence_end=date(2026, 12, 31) if recurring else None,
                type="academy",
                max_players=4,
                status="active",
                club_id=club.id,
            )
            db.session.add(row)
            db.session.flush()
            db.session.add(Association_CoachLesson(coach_id=coach.id, lesson_id=row.id))
            return row

        def one_off(title, start):
            parent = lesson(title, start)
            inst = LessonInstance(
                lesson_id=parent.id,
                start_datetime=start,
                end_datetime=start + timedelta(hours=1),
                max_players=4,
                status="scheduled",
                original_lesson_occurence_date=start.date(),
            )
            db.session.add(inst)
            db.session.flush()
            db.session.add(Association_CoachLessonInstance(coach_id=coach.id, lesson_instance_id=inst.id))

        one_off("B192 Sunday one-off", datetime(2026, 10, 4, 10, 0))
        # A weekly Sunday series that began the Sunday before: 4 Oct is a virtual occurrence.
        lesson("B192 Sunday series", datetime(2026, 9, 27, 11, 0), recurring=True)
        one_off("B192 next Monday midnight", datetime(2026, 10, 5, 0, 0))
        db.session.commit()
        return {"Authorization": f"Bearer {create_access_token(identity=str(user.id))}"}


def _titles_on(client, headers, to, day=SUNDAY):
    res = client.get(f"/api/app/lesson_instances?from={MONDAY}&to={to}", headers=headers)
    assert res.status_code == 200, res.get_data(as_text=True)
    return {e["title"] for e in res.get_json() if e.get("date") == day}


def test_a_one_off_class_on_the_weeks_sunday_is_listed(client, app):
    headers = _setup(app)
    assert "B192 Sunday one-off" in _titles_on(client, headers, SUNDAY)


def test_a_recurring_classs_sunday_occurrence_is_listed(client, app):
    headers = _setup(app)
    assert "B192 Sunday series" in _titles_on(client, headers, SUNDAY)


def test_the_inclusive_end_stops_at_the_end_of_that_day(client, app):
    headers = _setup(app)
    res = client.get(f"/api/app/lesson_instances?from={MONDAY}&to={SUNDAY}", headers=headers)
    titles = {e["title"] for e in res.get_json()}
    assert "B192 next Monday midnight" not in titles


def test_a_full_timestamp_to_keeps_its_exact_meaning(client, app):
    headers = _setup(app)
    # 08:00 on Sunday: the 10:00 and 11:00 classes are after it, so neither is listed.
    assert _titles_on(client, headers, f"{SUNDAY}T08:00:00") == set()
