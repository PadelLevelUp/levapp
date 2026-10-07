"""
PAD-540 — a never-filled spot is invited only if a one-shot job happens to be armed.

The engine opens a class's never-filled places (`_create_structural_vacancies`) only from
`trigger_invitations`, and for a class with no absence the only caller of that is the
`invite_start_<instance>` DateTrigger. That job is derived in `schedule_instance_jobs`, so it
needs a MATERIALISED occurrence, and `_reconcile_date_job` arms it only for a fire time still
in the future. An absence-created vacancy has an event path of its own (the absence writes the
row; the 2-minute tick starts it). A never-filled spot has none: when the window opens before
an instance with a future invite time exists, nobody is ever invited.

Cells 1 and 2 are the gap; cells 3 and 4 are controls that prove the seed and the engine.
Dates are in 2027 so the real clock never overtakes the pinned one (wall-clock-tests-fail-overnight).
Summer: Lisbon is UTC+1, so wall 18:00 is 17:00 UTC.
"""
from datetime import datetime, timedelta
from unittest.mock import patch

import pytest

from padel_app.sql_db import db
from padel_app.tests.helpers import pin_clock

pytestmark = pytest.mark.usefixtures("no_test_may_hang")

PATCHES = (
    "padel_app.services.notification_service.publish",
    "padel_app.services.notification_service.send_push_notification",
    "padel_app.utils.expo_push.send_expo_push_to_user",
)

CLASS_WALL = datetime(2027, 7, 12, 18, 0)        # Monday 18:00 Lisbon
CLASS_UTC = datetime(2027, 7, 12, 17, 0)
H = timedelta(hours=1)


def _seed(*, invite_hours: int, reminder_hours: int, tag: str):
    """Coach, two roster students (one enrolled, one free to invite), a 2-place one-off lesson,
    NOT materialised. Invitation start and first reminder as given, quiet hours off."""
    from padel_app.models.Association_CoachLesson import Association_CoachLesson
    from padel_app.models.Association_CoachPlayer import Association_CoachPlayer
    from padel_app.models.Association_PlayerLesson import Association_PlayerLesson
    from padel_app.models.clubs import Club
    from padel_app.models.coach_levels import CoachLevel
    from padel_app.models.coaches import Coach
    from padel_app.models.lessons import Lesson
    from padel_app.models.notification_config import NotificationConfig
    from padel_app.models.players import Player
    from padel_app.models.users import User

    def user(name):
        u = User(name=name.title(), username=f"p540{tag}{name}", email=f"p540{tag}{name}@t.test",
                 password="x", status="active")
        db.session.add(u)
        db.session.flush()
        return u

    coach = Coach(user_id=user("coach").id)
    db.session.add(coach)
    db.session.flush()
    level = CoachLevel(coach_id=coach.id, label="B", code="B1", display_order=1)
    club = Club(name=f"P540 {tag}", description="", location="Lisboa")
    db.session.add_all([level, club])
    db.session.flush()
    enrolled = Player(user_id=user("enrolled").id)
    free = Player(user_id=user("free").id)
    db.session.add_all([enrolled, free])
    db.session.flush()
    for p in (enrolled, free):
        db.session.add(Association_CoachPlayer(coach_id=coach.id, player_id=p.id, level_id=level.id))

    lesson = Lesson(title=f"P540 {tag}", start_datetime=CLASS_WALL, end_datetime=CLASS_WALL + H,
                    is_recurring=False, type="academy", max_players=2, color="#000",
                    status="active", club_id=club.id, default_level_id=level.id)
    db.session.add(lesson)
    db.session.flush()
    db.session.add(Association_CoachLesson(coach_id=coach.id, lesson_id=lesson.id))
    db.session.add(Association_PlayerLesson(player_id=enrolled.id, lesson_id=lesson.id))

    cfg = NotificationConfig(
        coach_id=coach.id, auto_notify_enabled=True,
        invitation_groups=[{"id": "1", "rules": []}],
        restrictions={"quietHours": {"enabled": False},
                      "maxSimultaneous": {"enabled": True, "value": 3},
                      "maxTotal": {"enabled": False, "value": 10}},
    )
    db.session.add(cfg)
    db.session.flush()
    cfg.reminder_timing = {
        "firstReminder": {"type": "hours_before", "value": reminder_hours},
        "invitationStart": {"type": "hours_before", "value": invite_hours},
    }
    db.session.commit()
    return {"coach": coach.id, "lesson": lesson.id, "free": free.id,
            "date": CLASS_WALL.date().isoformat()}


def _invites_for_class(instance_id) -> int:
    from padel_app.models.notification_event import NotificationEvent
    from padel_app.models.vacancy import Vacancy
    return (NotificationEvent.query.join(Vacancy, NotificationEvent.vacancy_id == Vacancy.id)
            .filter(Vacancy.lesson_instance_id == instance_id).count())


def _vacancies_for_class(instance_id) -> int:
    from padel_app.models.vacancy import Vacancy
    return Vacancy.query.filter_by(lesson_instance_id=instance_id).count()


def _instance_for(ids):
    from padel_app.models.lesson_instances import LessonInstance
    return LessonInstance.query.filter_by(lesson_id=ids["lesson"]).one_or_none()


def _jobs(sched, prefix):
    return sorted(j.id for j in sched._scheduler.get_jobs() if j.id.startswith(prefix))


def _run(sched, job_id):
    job = sched._scheduler.get_job(job_id)
    assert job is not None, f"{job_id} is not armed"
    job.func(*job.args)


def test_cell_1_a_window_that_opens_before_the_reminder_never_invites(app, live_scheduler, monkeypatch):
    """Invitations start 72 h before, the first reminder 48 h before. The occurrence is not
    materialised when the window opens, so nothing fires at 72 h. The reminder at 48 h materialises
    it, but the invite time is past by then and arms nothing. Nobody is ever invited."""
    from padel_app.services.notification_service import process_invitation_batches

    with app.app_context(), patch(PATCHES[0]), patch(PATCHES[1]), patch(PATCHES[2]):
        ids = _seed(invite_hours=72, reminder_hours=48, tag="c1")
        four_days = CLASS_UTC - 96 * H
        pin_clock(monkeypatch, four_days)
        live_scheduler.schedule_lesson_reminder_jobs(ids["lesson"], ids["coach"], now=four_days)
        assert _jobs(live_scheduler, "reminder_lesson_") == [f"reminder_lesson_{ids['lesson']}_{ids['date']}"]
        assert _jobs(live_scheduler, "invite_start_") == [], "no invitation-start job exists for an unmaterialised occurrence"

        # The window opens at 72 h: nothing is armed for it, the tick sees no vacancy.
        window = CLASS_UTC - 72 * H + timedelta(minutes=1)
        pin_clock(monkeypatch, window)
        process_invitation_batches(now=window)
        assert _instance_for(ids) is None

        # The reminder at 48 h materialises the occurrence; the invite time is already past.
        at_reminder = CLASS_UTC - 48 * H + timedelta(minutes=1)
        pin_clock(monkeypatch, at_reminder)
        _run(live_scheduler, f"reminder_lesson_{ids['lesson']}_{ids['date']}")
        instance = _instance_for(ids)
        assert instance is not None, "precondition: the reminder materialised the occurrence"
        assert live_scheduler._scheduler.get_job(f"invite_start_{instance.id}") is None

        # Every later tick up to the class finds nothing to start.
        for hours in (47, 24, 2):
            t = CLASS_UTC - hours * H
            pin_clock(monkeypatch, t)
            process_invitation_batches(now=t)

        assert _vacancies_for_class(instance.id) >= 1, (
            "a class with one unfilled place and no absence never got a vacancy"
        )
        assert _invites_for_class(instance.id) >= 1, "nobody was invited for the unfilled place"


def test_cell_2_a_class_materialised_inside_its_window_never_invites(app, live_scheduler, monkeypatch):
    """Default timings (reminder 48 h, invitations 24 h). The occurrence is materialised 12 h before
    the class, for example by the coach creating it (reminders rule 22) or opening it. The invite
    time is past, so `schedule_instance_jobs` arms nothing and no tick ever opens the place."""
    from padel_app.models.lessons import Lesson
    from padel_app.services.lesson_service import get_or_materialize_instance
    from padel_app.services.notification_service import process_invitation_batches

    with app.app_context(), patch(PATCHES[0]), patch(PATCHES[1]), patch(PATCHES[2]):
        ids = _seed(invite_hours=24, reminder_hours=48, tag="c2")
        twelve_h = CLASS_UTC - 12 * H
        pin_clock(monkeypatch, twelve_h)
        instance = get_or_materialize_instance(db.session.get(Lesson, ids["lesson"]), CLASS_WALL.date())
        db.session.commit()
        live_scheduler.schedule_instance_jobs(instance.id, ids["coach"], now=twelve_h)
        assert live_scheduler._scheduler.get_job(f"invite_start_{instance.id}") is None

        for hours in (11, 6, 2):
            t = CLASS_UTC - hours * H
            pin_clock(monkeypatch, t)
            process_invitation_batches(now=t)

        assert _vacancies_for_class(instance.id) >= 1, (
            "a class materialised after its window opened never got a vacancy"
        )
        assert _invites_for_class(instance.id) >= 1


def test_control_3_the_engine_opens_the_place_when_something_calls_it(app, live_scheduler, monkeypatch):
    """The same class as cell 2, with `trigger_invitations` called by hand inside the window: the
    structural vacancy is created and the free student is invited. The engine is fine; what is
    missing is the call."""
    from padel_app.models.lessons import Lesson
    from padel_app.services.lesson_service import get_or_materialize_instance
    from padel_app.services.notification_service import trigger_invitations

    with app.app_context(), patch(PATCHES[0]), patch(PATCHES[1]), patch(PATCHES[2]):
        ids = _seed(invite_hours=24, reminder_hours=48, tag="c3")
        twelve_h = CLASS_UTC - 12 * H
        pin_clock(monkeypatch, twelve_h)
        instance = get_or_materialize_instance(db.session.get(Lesson, ids["lesson"]), CLASS_WALL.date())
        db.session.commit()

        notified = trigger_invitations(instance, ids["coach"], now=twelve_h)

        assert [int(n["id"]) for n in notified] == [ids["free"]]
        assert _vacancies_for_class(instance.id) == 1
        assert _invites_for_class(instance.id) == 1


def test_control_4_reminder_before_the_window_arms_the_start_and_invites(app, live_scheduler, monkeypatch):
    """Default order: reminder 48 h, invitations 24 h. The reminder materialises the occurrence
    while the invite time is still ahead, the start job is armed, fires, and invites."""
    from padel_app.services.notification_service import process_invitation_batches

    with app.app_context(), patch(PATCHES[0]), patch(PATCHES[1]), patch(PATCHES[2]):
        ids = _seed(invite_hours=24, reminder_hours=48, tag="c4")
        four_days = CLASS_UTC - 96 * H
        pin_clock(monkeypatch, four_days)
        live_scheduler.schedule_lesson_reminder_jobs(ids["lesson"], ids["coach"], now=four_days)

        at_reminder = CLASS_UTC - 48 * H + timedelta(minutes=1)
        pin_clock(monkeypatch, at_reminder)
        _run(live_scheduler, f"reminder_lesson_{ids['lesson']}_{ids['date']}")
        instance = _instance_for(ids)
        assert instance is not None
        job = live_scheduler._scheduler.get_job(f"invite_start_{instance.id}")
        assert job is not None and job.trigger.run_date.replace(tzinfo=None) == CLASS_UTC - 24 * H

        at_window = CLASS_UTC - 24 * H
        pin_clock(monkeypatch, at_window)
        _run(live_scheduler, f"invite_start_{instance.id}")
        process_invitation_batches(now=at_window + timedelta(minutes=2))

        assert _vacancies_for_class(instance.id) == 1
        assert _invites_for_class(instance.id) == 1
