"""
B-056 — a student who declines an invitation was re-invited in the same round
(notifications.invitations rule 8 and its new acceptance criterion).

`evaluate_candidates` skipped a player only while their invitation for the
vacancy was `sent`, `queued` or `confirmed`. A decline (or a timeout) sets the
invitation to `expired`, so the decliner became eligible again in the very
round they had just answered, and `_send_next_on_decline` (or the next
inactivity batch) invited them straight back: the ranking does not change on a
decline, so the player invited first is still first. The spot was never offered
to anyone else, and because the decliner kept being picked, the round never ran
out and rule 8's "all declined or expired: next round" never fired.

One open spot, two students on the roster, one invitation at a time, a round
that admits both. The class is 12 hours out, so the invitation window is open.
"""
from datetime import datetime, timedelta
from unittest.mock import patch

from padel_app.sql_db import db


PATCHES = (
    "padel_app.services.notification_service.publish",
    "padel_app.services.notification_service.send_push_notification",
)

ROUNDS = [
    {"id": 1, "criteria": [], "criteria_values": {}, "description": "Everyone"},
    {"id": 2, "criteria": [], "criteria_values": {}, "description": "Everyone again"},
]


def _seed():
    """Coach, level, two roster students (first, second), a one-spot class 12 h
    out, the engine config and one open vacancy. Returns a dict of ids."""
    from padel_app.models.Association_CoachLessonInstance import Association_CoachLessonInstance
    from padel_app.models.Association_CoachPlayer import Association_CoachPlayer
    from padel_app.models.clubs import Club
    from padel_app.models.coach_levels import CoachLevel
    from padel_app.models.coaches import Coach
    from padel_app.models.lesson_instances import LessonInstance
    from padel_app.models.lessons import Lesson
    from padel_app.models.notification_config import NotificationConfig
    from padel_app.models.players import Player
    from padel_app.models.users import User
    from padel_app.models.vacancy import Vacancy

    def user(username):
        u = User(name=username.title(), username=username, email=f"{username}@t.test",
                 password="x", status="active")
        db.session.add(u)
        db.session.flush()
        return u

    coach_user = user("b056coach")
    coach = Coach(user_id=coach_user.id)
    db.session.add(coach)
    db.session.flush()
    level = CoachLevel(coach_id=coach.id, label="B", code="B1", display_order=1)
    club = Club(name="B056 Club", description="", location="Lisboa")
    db.session.add_all([level, club])
    db.session.flush()

    students = {}
    for name in ("first", "second"):
        u = user(f"b056{name}")
        p = Player(user_id=u.id)
        db.session.add(p)
        db.session.flush()
        db.session.add(Association_CoachPlayer(coach_id=coach.id, player_id=p.id, level_id=level.id))
        db.session.flush()
        students[name] = {"player_id": p.id, "user_id": u.id}

    start = datetime.utcnow() + timedelta(hours=12)
    lesson = Lesson(title="B056", start_datetime=start, end_datetime=start + timedelta(hours=1),
                    is_recurring=False, type="academy", max_players=1, color="#000",
                    status="active", club_id=club.id)
    db.session.add(lesson)
    db.session.flush()
    instance = LessonInstance(lesson_id=lesson.id, start_datetime=start,
                              end_datetime=start + timedelta(hours=1), max_players=1,
                              status="scheduled", level_id=level.id, notifications_enabled=True)
    db.session.add(instance)
    db.session.flush()
    db.session.add(Association_CoachLessonInstance(coach_id=coach.id, lesson_instance_id=instance.id))

    db.session.add(NotificationConfig(
        coach_id=coach.id,
        auto_notify_enabled=True,
        rounds=ROUNDS,
        restrictions={"maxSimultaneous": {"enabled": True, "value": 1},
                      "maxTotal": {"enabled": False, "value": 10}},
    ))
    vacancy = Vacancy(lesson_instance_id=instance.id, coach_id=coach.id, status="open",
                      current_round_number=1, current_batch_number=0)
    db.session.add(vacancy)
    db.session.commit()
    return {"coach_id": coach.id, "coach_user_id": coach_user.id, "instance_id": instance.id,
            "vacancy_id": vacancy.id, **{f"{k}_{f}": v[f] for k, v in students.items() for f in v}}


def _events(vacancy_id, player_id):
    from padel_app.models.notification_event import NotificationEvent
    return NotificationEvent.query.filter_by(vacancy_id=vacancy_id, player_id=player_id).order_by(
        NotificationEvent.id).all()


def _first_batch(ids):
    """Send round 1's first batch: one invitation, to the first-ranked student."""
    from padel_app.models.lesson_instances import LessonInstance
    from padel_app.models.vacancy import Vacancy
    from padel_app.services.notification_service import _send_invitation_batch, get_or_create_config

    vacancy = Vacancy.query.get(ids["vacancy_id"])
    instance = LessonInstance.query.get(ids["instance_id"])
    sent = _send_invitation_batch(vacancy, instance, get_or_create_config(ids["coach_id"]), ids["coach_id"])
    assert [s["id"] for s in sent] == [str(ids["first_player_id"])], sent
    return _events(ids["vacancy_id"], ids["first_player_id"])[0].id


def test_a_student_who_declines_is_not_invited_again_in_that_round(app):
    from padel_app.services.notification_service import respond_to_notification

    with app.app_context(), patch(PATCHES[0]), patch(PATCHES[1]):
        ids = _seed()
        event_id = _first_batch(ids)

        assert respond_to_notification(event_id, "no", ids["first_user_id"])["action"] == "declined"

        first = _events(ids["vacancy_id"], ids["first_player_id"])
        second = _events(ids["vacancy_id"], ids["second_player_id"])
        assert len(first) == 1, [(e.round_number, e.status) for e in first]
        assert [(e.round_number, e.status) for e in second] == [(1, "sent")]


def test_a_coach_recorded_decline_is_not_re_invited_by_the_next_batch(app):
    from padel_app.services.notification_service import (
        coach_respond_to_notification,
        process_invitation_batches,
    )

    with app.app_context(), patch(PATCHES[0]), patch(PATCHES[1]):
        ids = _seed()
        event_id = _first_batch(ids)

        coach_respond_to_notification(event_id, "no", ids["coach_id"])
        # maxInactiveTime defaults to 120 minutes: three hours later the engine sends again.
        process_invitation_batches(now=datetime.utcnow() + timedelta(hours=3))

        first = _events(ids["vacancy_id"], ids["first_player_id"])
        second = _events(ids["vacancy_id"], ids["second_player_id"])
        assert len(first) == 1, [(e.round_number, e.status) for e in first]
        assert [(e.round_number, e.status) for e in second] == [(1, "sent")]


def test_when_everyone_in_the_round_has_declined_the_round_moves_on(app):
    from padel_app.models.vacancy import Vacancy
    from padel_app.services.notification_service import respond_to_notification

    with app.app_context(), patch(PATCHES[0]), patch(PATCHES[1]):
        ids = _seed()
        first_event = _first_batch(ids)
        respond_to_notification(first_event, "no", ids["first_user_id"])
        second = _events(ids["vacancy_id"], ids["second_player_id"])
        assert second, "the second student was never invited"
        respond_to_notification(second[0].id, "no", ids["second_user_id"])

        vacancy = Vacancy.query.get(ids["vacancy_id"])
        # Nobody in round 1 is left to ask, so rule 8 moves the vacancy on
        # (PAD-87: the next round goes out on the next engine tick).
        assert vacancy.current_round_number == 2
        round_one = [
            (e.player_id, e.status)
            for pid in (ids["first_player_id"], ids["second_player_id"])
            for e in _events(ids["vacancy_id"], pid)
            if e.round_number == 1
        ]
        assert sorted(round_one) == sorted([
            (ids["first_player_id"], "expired"), (ids["second_player_id"], "expired"),
        ])
