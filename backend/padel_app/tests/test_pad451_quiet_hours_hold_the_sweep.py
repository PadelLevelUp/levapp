"""
PAD-451 probe / B-200 — do quiet hours hold the periodic sweep?

`trigger_invitations` refuses during quiet hours (notifications.config rule 6a). A vacancy
can also be opened another way — a student's cancellation creates it directly — and then
`process_invitation_batches` (every 2 minutes) sends its first batch ("Fresh vacancy —
trigger immediately"). This pins what that sweep does inside the quiet window.
"""
from datetime import datetime, timedelta
from unittest.mock import patch

from padel_app.sql_db import db

PATCHES = (
    "padel_app.services.notification_service.publish",
    "padel_app.services.notification_service.send_push_notification",
)

# 22:30 UTC on 10 June is 23:30 in Lisbon (WEST, UTC+1): inside the default 22:00-07:00 window.
NIGHT = datetime(2026, 6, 10, 22, 30)
# 06:30 UTC on 11 June is 07:30 in Lisbon: the window is over.
MORNING = datetime(2026, 6, 11, 6, 30)


def _seed(quiet: bool):
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
        u = User(name=username.title(), username=username, email=f"{username}@t.test", password="x", status="active")
        db.session.add(u)
        db.session.flush()
        return u

    coach = Coach(user_id=user("q451coach").id)
    db.session.add(coach)
    db.session.flush()
    level = CoachLevel(coach_id=coach.id, label="B", code="B1", display_order=1)
    club = Club(name="Q451 Club", description="", location="Lisboa")
    db.session.add_all([level, club])
    db.session.flush()
    p = Player(user_id=user("q451student").id)
    db.session.add(p)
    db.session.flush()
    db.session.add(Association_CoachPlayer(coach_id=coach.id, player_id=p.id, level_id=level.id))

    # A class at 09:00 Lisbon the next morning (wall clock, naive).
    start = datetime(2026, 6, 11, 9, 0)
    lesson = Lesson(title="Q451", start_datetime=start, end_datetime=start + timedelta(hours=1),
                    is_recurring=False, type="academy", max_players=1, color="#000",
                    status="active", club_id=club.id)
    db.session.add(lesson)
    db.session.flush()
    instance = LessonInstance(lesson_id=lesson.id, start_datetime=start, end_datetime=start + timedelta(hours=1),
                              max_players=1, status="scheduled", level_id=level.id, notifications_enabled=True)
    db.session.add(instance)
    db.session.flush()
    db.session.add(Association_CoachLessonInstance(coach_id=coach.id, lesson_instance_id=instance.id))
    db.session.add(NotificationConfig(
        coach_id=coach.id, auto_notify_enabled=True, invitation_groups=[{"id": "1", "rules": []}],
        restrictions={"quietHours": {"enabled": quiet},
                      "maxSimultaneous": {"enabled": True, "value": 3},
                      "maxTotal": {"enabled": False, "value": 10}},
    ))
    vacancy = Vacancy(lesson_instance_id=instance.id, coach_id=coach.id, status="open",
                      current_round_number=1, current_batch_number=0)
    db.session.add(vacancy)
    db.session.commit()
    return vacancy.id


def _sent(vacancy_id):
    from padel_app.models.notification_event import NotificationEvent
    return NotificationEvent.query.filter_by(vacancy_id=vacancy_id).count()


def test_the_sweep_sends_nothing_inside_quiet_hours(app):
    from padel_app.services.notification_service import process_invitation_batches

    with app.app_context(), patch(PATCHES[0]), patch(PATCHES[1]):
        vid = _seed(quiet=True)
        process_invitation_batches(now=NIGHT)
        assert _sent(vid) == 0


def test_the_held_vacancy_is_invited_once_the_window_ends(app):
    from padel_app.services.notification_service import process_invitation_batches

    with app.app_context(), patch(PATCHES[0]), patch(PATCHES[1]):
        vid = _seed(quiet=True)
        process_invitation_batches(now=NIGHT)
        process_invitation_batches(now=MORNING)
        assert _sent(vid) == 1


def test_without_quiet_hours_the_night_sweep_sends(app):
    from padel_app.services.notification_service import process_invitation_batches

    with app.app_context(), patch(PATCHES[0]), patch(PATCHES[1]):
        vid = _seed(quiet=False)
        process_invitation_batches(now=NIGHT)
        assert _sent(vid) == 1


def test_a_start_trigger_inside_quiet_hours_still_invites_after_the_window(app):
    """The one-shot invite_start trigger for a never-filled spot fires at 23:30 Lisbon. Nothing
    may be sent then, but the spot must not be lost: once the window ends, it is invited."""
    from padel_app.models.lesson_instances import LessonInstance
    from padel_app.models.vacancy import Vacancy
    from padel_app.services.notification_service import process_invitation_batches, trigger_invitations

    with app.app_context(), patch(PATCHES[0]), patch(PATCHES[1]):
        vid = _seed(quiet=True)
        v = Vacancy.query.get(vid)
        instance_id, coach_id = v.lesson_instance_id, v.coach_id
        db.session.delete(v)
        db.session.commit()
        instance = LessonInstance.query.get(instance_id)
        assert trigger_invitations(instance, coach_id, now=NIGHT) == []
        process_invitation_batches(now=MORNING)
        from padel_app.models.notification_event import NotificationEvent
        sent = NotificationEvent.query.join(Vacancy, NotificationEvent.vacancy_id == Vacancy.id).filter(
            Vacancy.lesson_instance_id == instance_id).count()
        assert sent >= 1


def test_a_trigger_refused_for_another_reason_creates_no_vacancy(app):
    """Only a quiet-hours refusal holds a spot. A class too close (minTimeBeforeClass) is refused
    as before: the trigger creates nothing."""
    from padel_app.models.lesson_instances import LessonInstance
    from padel_app.models.notification_config import NotificationConfig
    from padel_app.models.vacancy import Vacancy
    from padel_app.services.notification_service import trigger_invitations

    with app.app_context(), patch(PATCHES[0]), patch(PATCHES[1]):
        vid = _seed(quiet=True)
        v = Vacancy.query.get(vid)
        instance_id, coach_id = v.lesson_instance_id, v.coach_id
        db.session.delete(v)
        cfg = NotificationConfig.query.filter_by(coach_id=coach_id).first()
        restrictions = cfg.get_restrictions()
        restrictions["minTimeBeforeClass"] = {"enabled": True, "value": 240}
        cfg.restrictions = restrictions
        db.session.commit()
        # 06:30 Lisbon: still quiet, AND the 09:00 class is only 150 min away (< 240).
        now = datetime(2026, 6, 11, 5, 30)
        instance = LessonInstance.query.get(instance_id)
        assert trigger_invitations(instance, coach_id, now=now) == []
        assert Vacancy.query.filter_by(lesson_instance_id=instance_id).count() == 0
