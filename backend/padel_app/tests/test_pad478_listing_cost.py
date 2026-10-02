"""
PAD-478 part 2 (rule 10f), review of #499: what the past-due listing costs.

It runs on every timing save. The first version loaded every instance of each of the coach's
lessons, of any date, and asked several questions per class and per student: on this coach
(51 upcoming classes with 4 students each, 250 past ones) it made 60 queries when nothing was
past due and 1023 when everything was. Now 9 and 169 (about three per past-due class: its
presences, and the two blocked-student checks of the shared reminder instrument). The
budgets keep the cost from creeping back unnoticed.
"""
from datetime import datetime, timedelta

import pytest
from sqlalchemy import event

from padel_app.sql_db import db
from padel_app.tests.helpers import pin_clock
from padel_app.tests.test_pad256_reminder_clock import _seed

NOW_UTC = datetime(2027, 7, 10, 10, 0)
FIRST_CLASS = datetime(2027, 7, 11, 9, 0)


def _seed_busy_coach(app):
    """One coach: 5 weekly-ish lessons, 50 upcoming classes over the next 10 days (4 students
    each), and 250 past classes. Returns the coach id."""
    from padel_app.models.Association_CoachLesson import Association_CoachLesson
    from padel_app.models.Association_CoachLessonInstance import Association_CoachLessonInstance
    from padel_app.models.lesson_instances import LessonInstance
    from padel_app.models.lessons import Lesson
    from padel_app.models.players import Player
    from padel_app.models.presences import Presence
    from padel_app.models.users import User

    coach_id, _student, first_instance = _seed(app, FIRST_CLASS)
    club_id = db.session.get(Lesson, LessonInstance.query.get(first_instance).lesson_id).club_id
    players = []
    for i in range(4):
        user = User(name=f"Busy {i}", username=f"busy-{i}", email=f"busy{i}@t.test", password="x", status="active")
        db.session.add(user)
        db.session.flush()
        player = Player(user_id=user.id)
        db.session.add(player)
        db.session.flush()
        players.append(player.id)
    for n in range(5):
        start = FIRST_CLASS + timedelta(hours=n + 1)
        lesson = Lesson(title=f"Busy lesson {n}", start_datetime=start, end_datetime=start + timedelta(hours=1),
                        is_recurring=False, type="academy", max_players=4, color="#000000",
                        status="active", club_id=club_id)
        db.session.add(lesson)
        db.session.flush()
        db.session.add(Association_CoachLesson(coach_id=coach_id, lesson_id=lesson.id))
        for day in range(-50, 10):
            when = start + timedelta(days=day)
            instance = LessonInstance(lesson_id=lesson.id, start_datetime=when, end_datetime=when + timedelta(hours=1),
                                      max_players=4, status="scheduled" if day >= 0 else "completed",
                                      notifications_enabled=True, original_lesson_occurence_date=when.date())
            db.session.add(instance)
            db.session.flush()
            db.session.add(Association_CoachLessonInstance(coach_id=coach_id, lesson_instance_id=instance.id))
            if day >= 0:
                for player_id in players:
                    db.session.add(Presence(player_id=player_id, lesson_instance_id=instance.id,
                                            invited=True, enrolment_source="roster"))
    db.session.commit()
    return coach_id


@pytest.mark.parametrize("timing, past_due_classes, budget", [
    ({"type": "hours_before", "value": 12}, 0, 15),          # nothing is past due: the cheap case
    ({"type": "days_before_at_time", "days": 30, "time": "09:00"}, 51, 200),   # everything is
])
def test_the_listing_stays_within_its_query_budget(app, monkeypatch, timing, past_due_classes, budget):
    from padel_app.services.notification_service import get_or_create_config
    from padel_app.services.past_due_service import past_due

    pin_clock(monkeypatch, NOW_UTC)
    with app.app_context():
        coach_id = _seed_busy_coach(app)
        config = get_or_create_config(coach_id)
        config.reminder_timing = {"firstReminder": timing}
        config.save()
        db.session.expire_all()

        statements = []

        def count(_conn, _cursor, statement, _params, _context, _many):
            statements.append(statement)

        event.listen(db.engine, "before_cursor_execute", count)
        try:
            listed = past_due(coach_id)
        finally:
            event.remove(db.engine, "before_cursor_execute", count)

    import collections
    import re
    kinds = collections.Counter(re.search(r"FROM (\w+)", st).group(1) if re.search(r"FROM (\w+)", st) else st[:30] for st in statements)
    print(f"PAD478-COST timing={timing['type']} listed={len(listed['reminders'])} queries={len(statements)} by_table={dict(kinds.most_common(12))}")
    assert len(listed["reminders"]) == past_due_classes
    assert len(statements) <= budget


def test_the_bulk_count_agrees_with_the_single_count(app):
    """`count_attempts_bulk` feeds the listing; `count_attempts` feeds the pass. They share
    the "voided attempts do not count" filter, and must give the same numbers."""
    from padel_app.models.reminder_attempts import ReminderAttempt
    from padel_app.services import reminder_attempt_service as attempts

    with app.app_context():
        _coach, student, instance_id = _seed(app, FIRST_CLASS)
        for superseded, expired in ((False, False), (True, False), (True, True), (False, True)):
            db.session.add(ReminderAttempt(lesson_instance_id=instance_id, player_id=student,
                                           number=1, superseded=superseded, expired=expired))
        db.session.commit()

        single = attempts.count_attempts(instance_id, student)
        bulk = attempts.count_attempts_bulk([instance_id, 999999])

        assert single == 3
        assert bulk == {(instance_id, student): 3}
