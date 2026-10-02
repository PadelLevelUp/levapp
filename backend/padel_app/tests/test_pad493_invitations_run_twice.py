"""
PAD-493 (B-259): a class's invitations run more than once. Can a repeat call advance or expire a
vacancy whose invitations are still pending, or invite one student twice for one spot?

Two shapes, with a pinned clock and invitations already open (the class is tomorrow 09:00, the
invitation window opens 24 h before):
- Session-A's measured probe: trigger_invitations called again for the same class.
- The production repeat: two students decline minutes apart. Each decline calls
  trigger_invitations for the WHOLE class, so the second decline re-drives the first spot.

Run:
    pytest padel_app/tests/test_pad493_invitations_run_twice.py -v -s
"""
from datetime import datetime, timedelta
from unittest.mock import patch

from padel_app.sql_db import db

PATCHES = (
    "padel_app.services.notification_service.publish",
    "padel_app.services.notification_service.send_push_notification",
)

NOW = datetime(2026, 6, 10, 14, 0)           # 15:00 Lisbon; class tomorrow 09:00, window open
START = datetime(2026, 6, 11, 9, 0)


def _seed(*, enrolled: int, candidates: int, max_players: int):
    """A coach, one level, `enrolled` students on the class and `candidates` eligible others.
    One invitation round (no rules), batches of 3, no total cap, no quiet hours."""
    from padel_app.models.Association_CoachLessonInstance import Association_CoachLessonInstance
    from padel_app.models.Association_CoachPlayer import Association_CoachPlayer
    from padel_app.models.clubs import Club
    from padel_app.models.coach_levels import CoachLevel
    from padel_app.models.coaches import Coach
    from padel_app.models.lesson_instances import LessonInstance
    from padel_app.models.lessons import Lesson
    from padel_app.models.notification_config import NotificationConfig
    from padel_app.models.players import Player
    from padel_app.models.presences import Presence
    from padel_app.models.users import User

    def user(username):
        u = User(name=username.title(), username=username, email=f"{username}@t.test", password="x", status="active")
        db.session.add(u)
        db.session.flush()
        return u

    coach = Coach(user_id=user("p493coach").id)
    db.session.add(coach)
    db.session.flush()
    level = CoachLevel(coach_id=coach.id, label="B", code="B1", display_order=1)
    club = Club(name="P493 Club", description="", location="Lisboa")
    db.session.add_all([level, club])
    db.session.flush()

    def player(username):
        p = Player(user_id=user(username).id)
        db.session.add(p)
        db.session.flush()
        db.session.add(Association_CoachPlayer(coach_id=coach.id, player_id=p.id, level_id=level.id))
        return p

    students = [player(f"p493enrolled{i}") for i in range(enrolled)]
    others = [player(f"p493candidate{i}") for i in range(candidates)]

    lesson = Lesson(title="P493", start_datetime=START, end_datetime=START + timedelta(hours=1),
                    is_recurring=False, type="academy", max_players=max_players, color="#000",
                    status="active", club_id=club.id)
    db.session.add(lesson)
    db.session.flush()
    instance = LessonInstance(lesson_id=lesson.id, start_datetime=START, end_datetime=START + timedelta(hours=1),
                              max_players=max_players, status="scheduled", level_id=level.id,
                              notifications_enabled=True)
    db.session.add(instance)
    db.session.flush()
    db.session.add(Association_CoachLessonInstance(coach_id=coach.id, lesson_instance_id=instance.id))
    for s in students:
        db.session.add(Presence(player_id=s.id, lesson_instance_id=instance.id, invited=True,
                                confirmed=False, enrolment_source="coach"))
    db.session.add(NotificationConfig(
        coach_id=coach.id, auto_notify_enabled=True, invitation_groups=[{"id": "1", "rules": []}],
        restrictions={"quietHours": {"enabled": False},
                      "maxSimultaneous": {"enabled": True, "value": 3},
                      "maxTotal": {"enabled": False, "value": 10}},
    ))
    db.session.commit()
    return instance.id, coach.id, [s.user_id for s in students], [o.id for o in others]


def _vacancies(instance_id):
    from padel_app.models.vacancy import Vacancy

    return [
        (v.id, v.status, v.current_round_number, v.current_batch_number)
        for v in Vacancy.query.filter_by(lesson_instance_id=instance_id).order_by(Vacancy.id).all()
    ]


def _live_events(instance_id):
    from padel_app.models.notification_event import NotificationEvent

    return [
        (e.vacancy_id, e.player_id)
        for e in NotificationEvent.query.filter(
            NotificationEvent.lesson_instance_id == instance_id,
            NotificationEvent.status.in_(("sent", "queued")),
        ).order_by(NotificationEvent.id).all()
    ]


def test_a_second_trigger_leaves_a_pending_vacancy_alone_and_never_reinvites(app, monkeypatch):
    """Session-A's probe as a test: one spot, one eligible student, three calls."""
    from padel_app.models.lesson_instances import LessonInstance
    from padel_app.services.notification_service import trigger_invitations
    from padel_app.tests.helpers import pin_clock

    pin_clock(monkeypatch, NOW)
    with app.app_context(), patch(PATCHES[0]), patch(PATCHES[1]):
        instance_id, coach_id, _, _ = _seed(enrolled=0, candidates=1, max_players=1)
        instance = LessonInstance.query.get(instance_id)

        trigger_invitations(instance, coach_id, now=NOW)
        after_first = _vacancies(instance_id)
        trigger_invitations(instance, coach_id, now=NOW + timedelta(seconds=5))
        after_second = _vacancies(instance_id)
        trigger_invitations(instance, coach_id, now=NOW + timedelta(seconds=10))
        print("PAD-493 direct:", after_first, after_second, _vacancies(instance_id), _live_events(instance_id))

        # (a) the repeat must not advance or expire the vacancy whose invitation is pending
        assert after_second == after_first
        # (b) one spot, one student: still exactly one live invitation
        assert len(_live_events(instance_id)) == 1
        assert len(_vacancies(instance_id)) == 1


def test_two_declines_minutes_apart_leave_the_first_spot_alone(app, monkeypatch):
    """Two enrolled students decline five minutes apart. The second decline must not advance,
    expire or re-batch the first spot while its invitations are pending, and no student may hold
    two live invitations for one spot."""
    from padel_app.services.notification_service import respond_to_reminder
    from padel_app.tests.helpers import pin_clock

    pin_clock(monkeypatch, NOW)
    with app.app_context(), patch(PATCHES[0]), patch(PATCHES[1]):
        instance_id, coach_id, enrolled_user_ids, candidates = _seed(enrolled=2, candidates=5, max_players=2)

        respond_to_reminder(instance_id, "no", enrolled_user_ids[0], now=NOW)
        first_spot = _vacancies(instance_id)
        first_events = _live_events(instance_id)

        later = NOW + timedelta(minutes=5)
        pin_clock(monkeypatch, later)
        respond_to_reminder(instance_id, "no", enrolled_user_ids[1], now=later)
        print("PAD-493 declines:", first_spot, first_events, "->", _vacancies(instance_id), _live_events(instance_id))

        vacancy_a = first_spot[0]
        a_now = next(v for v in _vacancies(instance_id) if v[0] == vacancy_a[0])
        # (a) the first spot is untouched by the second decline: same status, round and batch
        assert a_now == vacancy_a
        # ... and it gained no invitations: the next batch waits for its own interval
        assert [e for e in _live_events(instance_id) if e[0] == vacancy_a[0]] == [e for e in first_events if e[0] == vacancy_a[0]]
        # (b) per spot, no student holds two live invitations
        pairs = _live_events(instance_id)
        assert len(pairs) == len(set(pairs))
