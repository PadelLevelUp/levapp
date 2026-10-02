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


def _seed(*, enrolled: int, candidates: int, max_players: int, quiet: bool = False, semi: bool = False,
          max_total: int | None = None, max_inactive: bool = True):
    """A coach, one level, `enrolled` students on the class and `candidates` eligible others.
    One invitation round (no rules), batches of 3, 120 min between batches, no total cap; quiet
    hours (22:00-07:00 Lisbon) only with `quiet`, approval before sending only with `semi`."""
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
        invitation_mode="semi_automatic" if semi else "automatic",
        restrictions={"quietHours": {"enabled": quiet},
                      "maxSimultaneous": {"enabled": True, "value": 3},
                      "maxInactiveTime": {"enabled": max_inactive, "value": 120},
                      "maxTotal": {"enabled": max_total is not None, "value": max_total or 10}},
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


def test_b260_a_repeated_no_on_one_invitation_invites_nobody_else(app, monkeypatch):
    """B-260: a student answers "no" to the same invitation twice (double tap, retry). The second
    answer must not invite another student: only the first decline frees an offer slot."""
    from padel_app.models.lesson_instances import LessonInstance
    from padel_app.models.notification_event import NotificationEvent
    from padel_app.models.players import Player
    from padel_app.services.notification_service import respond_to_notification, trigger_invitations
    from padel_app.tests.helpers import pin_clock

    pin_clock(monkeypatch, NOW)
    with app.app_context(), patch(PATCHES[0]), patch(PATCHES[1]):
        instance_id, coach_id, _, candidates = _seed(enrolled=0, candidates=6, max_players=1)
        trigger_invitations(LessonInstance.query.get(instance_id), coach_id, now=NOW)
        first = NotificationEvent.query.filter_by(lesson_instance_id=instance_id).order_by(NotificationEvent.id).first()
        decliner_user_id = Player.query.get(first.player_id).user_id

        respond_to_notification(first.id, "no", decliner_user_id, now=NOW + timedelta(minutes=1))
        after_first_no = _live_events(instance_id)
        total_after_first_no = NotificationEvent.query.filter_by(lesson_instance_id=instance_id).count()
        respond_to_notification(first.id, "no", decliner_user_id, now=NOW + timedelta(minutes=2))
        print("B-260 repeated no:", after_first_no, "->", _live_events(instance_id))

        assert _live_events(instance_id) == after_first_no
        assert NotificationEvent.query.filter_by(lesson_instance_id=instance_id).count() == total_after_first_no


def test_b260_a_repeated_yes_keeps_the_spot_and_its_confirmation(app, monkeypatch):
    """B-260: a student who won the spot answers "yes" a second time (double tap, retry). They keep
    the spot, the invitation stays confirmed, and nobody is told the spot was filled."""
    from padel_app.models.lesson_instances import LessonInstance
    from padel_app.models.notification_event import NotificationEvent
    from padel_app.models.players import Player
    from padel_app.services.notification_service import respond_to_notification, trigger_invitations
    from padel_app.tests.helpers import pin_clock

    pin_clock(monkeypatch, NOW)
    with app.app_context(), patch(PATCHES[0]), patch(PATCHES[1]):
        instance_id, coach_id, _, _ = _seed(enrolled=0, candidates=3, max_players=1)
        trigger_invitations(LessonInstance.query.get(instance_id), coach_id, now=NOW)
        first = NotificationEvent.query.filter_by(lesson_instance_id=instance_id).order_by(NotificationEvent.id).first()
        winner_user_id = Player.query.get(first.player_id).user_id

        assert respond_to_notification(first.id, "yes", winner_user_id, now=NOW + timedelta(minutes=1))["action"] != "spot_filled_waiting_list_offered"
        second = respond_to_notification(first.id, "yes", winner_user_id, now=NOW + timedelta(minutes=2))
        print("B-260 repeated yes:", second, NotificationEvent.query.get(first.id).status, _vacancies(instance_id))

        assert second["action"] != "spot_filled_waiting_list_offered"
        assert NotificationEvent.query.get(first.id).status == "confirmed"


# ── F2: a spot is not dropped while someone asked can still say yes (rule 16) ──────────────────

def _one_spot_one_student_started(app_monkeypatch_now):
    """One open spot, one eligible student holding a live invitation from the first batch."""
    from padel_app.models.lesson_instances import LessonInstance
    from padel_app.models.notification_event import NotificationEvent
    from padel_app.models.players import Player
    from padel_app.services.notification_service import trigger_invitations

    instance_id, coach_id, _, _ = _seed(enrolled=0, candidates=1, max_players=1)
    trigger_invitations(LessonInstance.query.get(instance_id), coach_id, now=NOW)
    event = NotificationEvent.query.filter_by(lesson_instance_id=instance_id).one()
    return instance_id, coach_id, event.id, Player.query.get(event.player_id).user_id


def test_rounds_that_run_out_under_a_live_invitation_hold_the_spot_and_accept_a_yes(app, monkeypatch):
    from padel_app.models.lesson_instances import LessonInstance
    from padel_app.services.notification_service import (
        process_invitation_batches,
        respond_to_notification,
        trigger_invitations,
    )
    from padel_app.tests.helpers import pin_clock

    pin_clock(monkeypatch, NOW)
    with app.app_context(), patch(PATCHES[0]), patch(PATCHES[1]):
        instance_id, coach_id, event_id, user_id = _one_spot_one_student_started(None)

        # Well past maxInactiveTime, several ticks: nobody else to invite, the one offer is live.
        for hours in (3, 4, 5):
            later = NOW + timedelta(hours=hours)
            pin_clock(monkeypatch, later)
            process_invitation_batches(now=later)
        held = _vacancies(instance_id)
        trigger_invitations(LessonInstance.query.get(instance_id), coach_id, now=NOW + timedelta(hours=5))
        print("F2 hold:", held, _vacancies(instance_id), _live_events(instance_id))

        assert [(v[1], v[2]) for v in held] == [("open", 1)]
        assert len(_vacancies(instance_id)) == 1          # no second vacancy while it holds
        assert len(_live_events(instance_id)) == 1

        result = respond_to_notification(event_id, "yes", user_id, now=NOW + timedelta(hours=5, minutes=1))
        assert result["action"] == "confirmed"
        assert _vacancies(instance_id)[0][1] == "filled"


def test_a_held_spot_expires_when_its_last_live_invitation_is_declined(app, monkeypatch):
    from padel_app.services.notification_service import process_invitation_batches, respond_to_notification
    from padel_app.tests.helpers import pin_clock

    pin_clock(monkeypatch, NOW)
    with app.app_context(), patch(PATCHES[0]), patch(PATCHES[1]):
        instance_id, coach_id, event_id, user_id = _one_spot_one_student_started(None)
        later = NOW + timedelta(hours=3)
        pin_clock(monkeypatch, later)
        process_invitation_batches(now=later)
        assert _vacancies(instance_id)[0][1] == "open"

        respond_to_notification(event_id, "no", user_id, now=later + timedelta(minutes=1))
        print("F2 decline:", _vacancies(instance_id), _live_events(instance_id))
        assert _vacancies(instance_id)[0][1] == "expired"
        assert _live_events(instance_id) == []


def test_b260_a_no_on_a_confirmed_invitation_changes_nothing(app, monkeypatch):
    """B-260 (rule 17): a "no" after winning the spot is not a way out. The invitation stays
    confirmed, the student keeps the spot, and nobody else is invited; leaving the class goes
    through the attendance cancel path."""
    from padel_app.models.lesson_instances import LessonInstance
    from padel_app.models.notification_event import NotificationEvent
    from padel_app.models.players import Player
    from padel_app.services.notification_service import respond_to_notification, trigger_invitations
    from padel_app.tests.helpers import pin_clock

    pin_clock(monkeypatch, NOW)
    with app.app_context(), patch(PATCHES[0]), patch(PATCHES[1]):
        instance_id, coach_id, _, _ = _seed(enrolled=0, candidates=5, max_players=1)
        trigger_invitations(LessonInstance.query.get(instance_id), coach_id, now=NOW)
        first = NotificationEvent.query.filter_by(lesson_instance_id=instance_id).order_by(NotificationEvent.id).first()
        winner_user_id = Player.query.get(first.player_id).user_id
        respond_to_notification(first.id, "yes", winner_user_id, now=NOW + timedelta(minutes=1))
        total = NotificationEvent.query.filter_by(lesson_instance_id=instance_id).count()

        result = respond_to_notification(first.id, "no", winner_user_id, now=NOW + timedelta(minutes=2))

        assert result["action"] == "declined"
        assert NotificationEvent.query.get(first.id).status == "confirmed"
        assert first.player_id in LessonInstance.query.get(instance_id).enrolled_player_ids
        assert NotificationEvent.query.filter_by(lesson_instance_id=instance_id).count() == total
        assert _vacancies(instance_id)[0][1] == "filled"
