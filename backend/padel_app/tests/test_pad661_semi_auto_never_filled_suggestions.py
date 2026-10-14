"""
PAD-661 — semi-automatic mode: no invitation suggestions for never-filled places inside the
"start invitations" window (follow-up to PAD-540 / B-301, rule 1c).

Rule 1c gives a never-filled place two paths: a lesson-level ``invite_start_lesson_<lesson>_<date>``
job for an occurrence not materialised yet, armed only for a FUTURE fire time
(``_reconcile_date_job``, config rule 10a), and the tick's scan of MATERIALISED classes. An
occurrence whose window had already opened when the jobs were derived (a deploy, a restart, a
config or lesson save, the daily pass) and that nothing has materialised yet is seen by neither
path until the reminder materialises it — with a 7-day window and a 48 h reminder, five days late.

Groups: two controls (the semi-automatic prompt on both existing paths); the gap, in both modes,
through the catch-up and a second derivation; what the catch-up must keep (a pending one), replace
(a job from an earlier timing, a catch-up that never fired) and never arm (a materialised date, a
timing of `none`, a class already started); the burst over a coach's lessons; the reminder path
after the catch-up. Dates in 2027 so the real clock never overtakes the pinned one; summer, so
wall 18:00 Lisbon is 17:00 UTC.
"""
import contextlib
from datetime import datetime, timedelta
from unittest.mock import patch

import pytest

from padel_app.scheduler import INVITE_START_CATCH_UP
from padel_app.sql_db import db
from padel_app.tests.helpers import pin_clock

pytestmark = pytest.mark.usefixtures("no_test_may_hang")

PATCHES = (
    "padel_app.services.notification_service.publish",
    "padel_app.services.notification_service.send_push_notification",
    "padel_app.utils.expo_push.send_expo_push_to_user",
    "padel_app.services.replacement_approval_service.publish",
    "padel_app.services.replacement_approval_service.send_push_notification",
)

CLASS_WALL = datetime(2027, 7, 12, 18, 0)        # Monday 18:00 Lisbon
CLASS_UTC = datetime(2027, 7, 12, 17, 0)
H = timedelta(hours=1)
D = timedelta(days=1)
# "7 days before, at 19:30" (the ticket's coach): wall 2027-07-05 19:30 = 18:30 UTC.
WINDOW_7D_1930_UTC = datetime(2027, 7, 5, 18, 30)


def _seed(*, mode: str, invitation_start: dict, reminder_hours: int | None, tag: str):
    """Coach in ``mode``, two roster students (one enrolled, one free to invite), a 2-place one-off
    lesson, NOT materialised. Quiet hours off, no restrictions that could hold a prompt."""
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
        u = User(name=name.title(), username=f"p661{tag}{name}", email=f"p661{tag}{name}@t.test",
                 password="x", status="active")
        db.session.add(u)
        db.session.flush()
        return u

    coach_user = user("coach")
    coach = Coach(user_id=coach_user.id)
    db.session.add(coach)
    db.session.flush()
    level = CoachLevel(coach_id=coach.id, label="B", code="B1", display_order=1)
    club = Club(name=f"P661 {tag}", description="", location="Lisboa")
    db.session.add_all([level, club])
    db.session.flush()
    enrolled = Player(user_id=user("enrolled").id)
    free = Player(user_id=user("free").id)
    db.session.add_all([enrolled, free])
    db.session.flush()
    for p in (enrolled, free):
        db.session.add(Association_CoachPlayer(coach_id=coach.id, player_id=p.id, level_id=level.id))

    lesson = Lesson(title=f"P661 {tag}", start_datetime=CLASS_WALL, end_datetime=CLASS_WALL + H,
                    is_recurring=False, type="academy", max_players=2, color="#000",
                    status="active", club_id=club.id, default_level_id=level.id)
    db.session.add(lesson)
    db.session.flush()
    db.session.add(Association_CoachLesson(coach_id=coach.id, lesson_id=lesson.id))
    db.session.add(Association_PlayerLesson(player_id=enrolled.id, lesson_id=lesson.id))

    cfg = NotificationConfig(
        coach_id=coach.id, auto_notify_enabled=True, invitation_mode=mode,
        invitation_groups=[{"id": "1", "rules": []}],
        restrictions={"quietHours": {"enabled": False},
                      "maxSimultaneous": {"enabled": True, "value": 3},
                      "maxTotal": {"enabled": False, "value": 10}},
    )
    db.session.add(cfg)
    db.session.flush()
    cfg.reminder_timing = {
        "firstReminder": ({"type": "none"} if reminder_hours is None
                          else {"type": "hours_before", "value": reminder_hours}),
        "invitationStart": invitation_start,
    }
    db.session.commit()
    return {"coach": coach.id, "coach_user": coach_user.id, "lesson": lesson.id,
            "free": free.id, "date": CLASS_WALL.date().isoformat()}


def _instance_for(ids):
    from padel_app.models.lesson_instances import LessonInstance
    return LessonInstance.query.filter_by(lesson_id=ids["lesson"]).one_or_none()


def _state(instance_id) -> dict:
    """What the coach can see for one class: vacancies by approval status, prompts, the approval
    message in the assistant conversation, and student invitations."""
    from padel_app.models.messages import Message
    from padel_app.models.notification_event import NotificationEvent
    from padel_app.models.replacement_approval_prompt import ReplacementApprovalPrompt
    from padel_app.models.vacancy import Vacancy

    vacancies = Vacancy.query.filter_by(lesson_instance_id=instance_id).all()
    prompts = (ReplacementApprovalPrompt.query.join(Vacancy, ReplacementApprovalPrompt.vacancy_id == Vacancy.id)
               .filter(Vacancy.lesson_instance_id == instance_id).all())
    msg_ids = {p.message_id for p in prompts if p.message_id}
    approval_msgs = (Message.query.filter(Message.id.in_(msg_ids), Message.message_type == "replacement_approval").count()
                     if msg_ids else 0)
    invitations = (NotificationEvent.query.join(Vacancy, NotificationEvent.vacancy_id == Vacancy.id)
                   .filter(Vacancy.lesson_instance_id == instance_id).count())
    return {
        "vacancies": sorted(v.approval_status for v in vacancies),
        "prompts": len(prompts),
        "approval_messages": approval_msgs,
        "invitations": invitations,
    }


SUGGESTED = {"vacancies": ["pending"], "prompts": 1, "approval_messages": 1, "invitations": 0}
INVITED = {"vacancies": ["not_required"], "prompts": 0, "approval_messages": 0, "invitations": 1}


def _run(sched, job_id):
    job = sched._scheduler.get_job(job_id)
    assert job is not None, f"{job_id} is not armed"
    job.func(*job.args)


@contextlib.contextmanager
def _patched():
    with contextlib.ExitStack() as stack:
        for target in PATCHES:
            stack.enter_context(patch(target))
        yield


# --- controls: both existing paths do produce the semi-automatic prompt ---------------------------

def test_control_tick_path_semi_auto_suggests_a_never_filled_place(app, live_scheduler, monkeypatch):
    """Cell 2 of PAD-540 in semi-automatic mode: a class materialised inside its window is opened by
    the next tick, and the coach gets an approval prompt (one pending vacancy, one prompt, one
    replacement_approval message), no student invitation."""
    from padel_app.models.lessons import Lesson
    from padel_app.services.lesson_service import get_or_materialize_instance
    from padel_app.services.notification_service import process_invitation_batches

    with app.app_context(), _patched():
        ids = _seed(mode="semi_automatic", invitation_start={"type": "hours_before", "value": 24},
                    reminder_hours=48, tag="t")
        twelve_h = CLASS_UTC - 12 * H
        pin_clock(monkeypatch, twelve_h)
        instance = get_or_materialize_instance(db.session.get(Lesson, ids["lesson"]), CLASS_WALL.date())
        db.session.commit()
        live_scheduler.schedule_instance_jobs(instance.id, ids["coach"], now=twelve_h)

        process_invitation_batches(now=twelve_h + timedelta(minutes=2))
        assert _state(instance.id) == SUGGESTED
        # A second tick asks nothing twice.
        process_invitation_batches(now=twelve_h + timedelta(minutes=4))
        assert _state(instance.id) == SUGGESTED


def test_control_lesson_job_path_semi_auto_suggests_a_never_filled_place(app, live_scheduler, monkeypatch):
    """Cell 1 of PAD-540 in semi-automatic mode: the jobs are derived BEFORE the window opens, the
    lesson-level start job fires at the window, materialises the occurrence and the coach gets the
    prompt."""
    with app.app_context(), _patched():
        ids = _seed(mode="semi_automatic", invitation_start={"type": "hours_before", "value": 72},
                    reminder_hours=48, tag="j")
        four_days = CLASS_UTC - 96 * H
        pin_clock(monkeypatch, four_days)
        live_scheduler.schedule_lesson_reminder_jobs(ids["lesson"], ids["coach"], now=four_days)
        occ = f"{ids['lesson']}_{ids['date']}"
        assert live_scheduler._scheduler.get_job(f"invite_start_lesson_{occ}") is not None

        window = CLASS_UTC - 72 * H
        pin_clock(monkeypatch, window)
        _run(live_scheduler, f"invite_start_lesson_{occ}")
        instance = _instance_for(ids)
        assert instance is not None
        assert _state(instance.id) == SUGGESTED


# --- the gap: the window is already open when the jobs are derived, nothing is materialised ------

@pytest.mark.parametrize("mode,expected", [("semi_automatic", SUGGESTED), ("automatic", INVITED)])
def test_window_already_open_at_derivation_is_opened_by_the_next_tick(app, live_scheduler, monkeypatch, mode, expected):
    """The ticket's coach: "start invitations 7 days before, at 19:30", first reminder 48 h before.
    The jobs are derived 5 days before the class (a deploy, a restart, a save, the daily pass): the
    window opened two days ago, so no lesson-level job is armed (config rule 10a) and the occurrence
    is not materialised, so the tick's scan does not see it either. Expected (ticket, acceptance 1):
    the suggestions exist once the window is open and the engine has had a tick. Observed before the
    fix: nothing until the reminder materialises the occurrence at 48 h."""
    from padel_app.services.notification_service import process_invitation_batches

    with app.app_context(), _patched():
        ids = _seed(mode=mode, invitation_start={"type": "days_before_at_time", "days": 7, "time": "19:30"},
                    reminder_hours=48, tag=f"g{mode[:4]}")
        five_days = CLASS_UTC - 5 * D
        assert five_days > WINDOW_7D_1930_UTC, "the derivation must happen inside the window"
        pin_clock(monkeypatch, five_days)
        live_scheduler.schedule_lesson_reminder_jobs(ids["lesson"], ids["coach"], now=five_days)
        assert _instance_for(ids) is None, "the derivation itself materialises nothing (rule 10a)"
        occ = f"{ids['lesson']}_{ids['date']}"
        job = live_scheduler._scheduler.get_job(f"invite_start_lesson_{occ}")
        assert job is not None, (
            "window open since 2027-07-05 18:30Z, derived at -5 d: no catch-up armed, the "
            "occurrence is never opened"
        )
        assert job.trigger.run_date.replace(tzinfo=None) == five_days + INVITE_START_CATCH_UP

        # Two minutes later the catch-up fires: materialises and opens; the tick adds nothing.
        pin_clock(monkeypatch, five_days + INVITE_START_CATCH_UP)
        _run(live_scheduler, f"invite_start_lesson_{occ}")
        instance = _instance_for(ids)
        assert instance is not None
        assert _state(instance.id) == expected
        process_invitation_batches(now=five_days + INVITE_START_CATCH_UP + timedelta(minutes=2))
        assert _state(instance.id) == expected
        assert live_scheduler._scheduler.get_job(f"invite_start_lesson_{occ}") is None

        # A second derivation inside the window finds the date materialised: no catch-up again.
        later = five_days + 6 * H
        pin_clock(monkeypatch, later)
        live_scheduler.schedule_lesson_reminder_jobs(ids["lesson"], ids["coach"], now=later)
        assert live_scheduler._scheduler.get_job(f"invite_start_lesson_{occ}") is None
        process_invitation_batches(now=later + timedelta(minutes=2))
        assert _state(instance.id) == expected


def test_the_reminder_after_the_catch_up_asks_nothing_twice(app, live_scheduler, monkeypatch):
    """After the catch-up has materialised and opened the occurrence, the reminder at 48 h (now the
    instance's own job) reminds the enrolled student and starts nothing more: still one prompt."""
    from padel_app.services.notification_service import process_invitation_batches

    with app.app_context(), _patched():
        ids = _seed(mode="semi_automatic", invitation_start={"type": "days_before_at_time", "days": 7, "time": "19:30"},
                    reminder_hours=48, tag="late")
        five_days = CLASS_UTC - 5 * D
        pin_clock(monkeypatch, five_days)
        live_scheduler.schedule_lesson_reminder_jobs(ids["lesson"], ids["coach"], now=five_days)
        occ = f"{ids['lesson']}_{ids['date']}"
        pin_clock(monkeypatch, five_days + INVITE_START_CATCH_UP)
        _run(live_scheduler, f"invite_start_lesson_{occ}")
        instance = _instance_for(ids)
        assert _state(instance.id) == SUGGESTED
        assert live_scheduler._scheduler.get_job(f"reminder_lesson_{occ}") is None, "materialising moved the reminder to the instance"

        at_reminder = CLASS_UTC - 48 * H + timedelta(minutes=1)
        pin_clock(monkeypatch, at_reminder)
        _run(live_scheduler, f"reminder_{instance.id}")
        process_invitation_batches(now=at_reminder + timedelta(minutes=2))
        assert _state(instance.id) == SUGGESTED


def test_a_pending_catch_up_survives_a_second_derivation(app, live_scheduler, monkeypatch):
    """Two derivations one minute apart inside the window (a save right after a restart): the first
    arms the catch-up, the second keeps it where it is instead of removing it (rule 10a's "armed at
    the implied time") or pushing it out again."""
    with app.app_context(), _patched():
        ids = _seed(mode="semi_automatic", invitation_start={"type": "days_before_at_time", "days": 7, "time": "19:30"},
                    reminder_hours=48, tag="keep")
        five_days = CLASS_UTC - 5 * D
        pin_clock(monkeypatch, five_days)
        live_scheduler.schedule_lesson_reminder_jobs(ids["lesson"], ids["coach"], now=five_days)
        occ = f"{ids['lesson']}_{ids['date']}"
        first = live_scheduler._scheduler.get_job(f"invite_start_lesson_{occ}").trigger.run_date

        a_minute_later = five_days + timedelta(minutes=1)
        pin_clock(monkeypatch, a_minute_later)
        live_scheduler.schedule_lesson_reminder_jobs(ids["lesson"], ids["coach"], now=a_minute_later)
        job = live_scheduler._scheduler.get_job(f"invite_start_lesson_{occ}")
        assert job is not None and job.trigger.run_date == first


def test_a_materialised_date_never_gets_the_catch_up(app, live_scheduler, monkeypatch):
    """The class of PAD-540 cell 2 (materialised inside its window, no start job): the lesson walk
    arms no lesson-level job for that date — the instance path (the tick) owns it."""
    from padel_app.models.lessons import Lesson
    from padel_app.services.lesson_service import get_or_materialize_instance

    with app.app_context(), _patched():
        ids = _seed(mode="semi_automatic", invitation_start={"type": "hours_before", "value": 24},
                    reminder_hours=48, tag="mat")
        twelve_h = CLASS_UTC - 12 * H
        pin_clock(monkeypatch, twelve_h)
        get_or_materialize_instance(db.session.get(Lesson, ids["lesson"]), CLASS_WALL.date())
        db.session.commit()
        live_scheduler.schedule_lesson_reminder_jobs(ids["lesson"], ids["coach"], now=twelve_h)
        occ = f"{ids['lesson']}_{ids['date']}"
        assert live_scheduler._scheduler.get_job(f"invite_start_lesson_{occ}") is None


def test_a_timing_of_none_arms_no_catch_up(app, live_scheduler, monkeypatch):
    """An invitation start of type `none` opens nothing from the derivation either."""
    with app.app_context(), _patched():
        ids = _seed(mode="semi_automatic", invitation_start={"type": "none"}, reminder_hours=48, tag="none")
        five_days = CLASS_UTC - 5 * D
        pin_clock(monkeypatch, five_days)
        live_scheduler.schedule_lesson_reminder_jobs(ids["lesson"], ids["coach"], now=five_days)
        occ = f"{ids['lesson']}_{ids['date']}"
        assert live_scheduler._scheduler.get_job(f"invite_start_lesson_{occ}") is None


def test_a_class_already_started_gets_no_catch_up(app, live_scheduler, monkeypatch):
    """A derivation after the class started (the daily pass walks from the cutoff, but a lesson
    saved during its own class is walked too): nothing is armed for a class that is not ahead."""
    with app.app_context(), _patched():
        ids = _seed(mode="semi_automatic", invitation_start={"type": "hours_before", "value": 24},
                    reminder_hours=48, tag="over")
        after_start = CLASS_UTC + timedelta(minutes=10)
        pin_clock(monkeypatch, after_start)
        live_scheduler.schedule_lesson_reminder_jobs(ids["lesson"], ids["coach"], now=after_start)
        occ = f"{ids['lesson']}_{ids['date']}"
        assert live_scheduler._scheduler.get_job(f"invite_start_lesson_{occ}") is None


def test_a_job_from_an_earlier_timing_is_replaced_by_the_catch_up(app, live_scheduler, monkeypatch):
    """The coach had "24 h before" (job armed far ahead), then saves "7 days before at 19:30" with
    the class five days out: the window is open NOW, so the far-future job is replaced by the
    catch-up two minutes out, not kept as if it were a pending catch-up."""
    from padel_app.models.notification_config import NotificationConfig

    with app.app_context(), _patched():
        ids = _seed(mode="semi_automatic", invitation_start={"type": "hours_before", "value": 24},
                    reminder_hours=48, tag="earl")
        five_days = CLASS_UTC - 5 * D
        pin_clock(monkeypatch, five_days)
        live_scheduler.schedule_lesson_reminder_jobs(ids["lesson"], ids["coach"], now=five_days)
        occ = f"{ids['lesson']}_{ids['date']}"
        assert live_scheduler._scheduler.get_job(f"invite_start_lesson_{occ}").trigger.run_date.replace(tzinfo=None) == CLASS_UTC - 24 * H

        cfg = NotificationConfig.query.filter_by(coach_id=ids["coach"]).one()
        cfg.reminder_timing = {"firstReminder": {"type": "hours_before", "value": 48},
                               "invitationStart": {"type": "days_before_at_time", "days": 7, "time": "19:30"}}
        db.session.commit()
        a_minute_later = five_days + timedelta(minutes=1)
        pin_clock(monkeypatch, a_minute_later)
        live_scheduler.schedule_lesson_reminder_jobs(ids["lesson"], ids["coach"], now=a_minute_later)
        job = live_scheduler._scheduler.get_job(f"invite_start_lesson_{occ}")
        assert job.trigger.run_date.replace(tzinfo=None) == a_minute_later + INVITE_START_CATCH_UP


def test_a_catch_up_that_never_fired_is_armed_again(app, live_scheduler, monkeypatch):
    """A restart three minutes after the catch-up was armed (it did not fire: the process was down):
    the startup derivation arms a fresh catch-up two minutes out instead of leaving a job in the past."""
    with app.app_context(), _patched():
        ids = _seed(mode="semi_automatic", invitation_start={"type": "days_before_at_time", "days": 7, "time": "19:30"},
                    reminder_hours=48, tag="miss")
        five_days = CLASS_UTC - 5 * D
        pin_clock(monkeypatch, five_days)
        live_scheduler.schedule_lesson_reminder_jobs(ids["lesson"], ids["coach"], now=five_days)
        occ = f"{ids['lesson']}_{ids['date']}"

        three_min = five_days + timedelta(minutes=3)
        pin_clock(monkeypatch, three_min)
        live_scheduler.schedule_lesson_reminder_jobs(ids["lesson"], ids["coach"], now=three_min)
        job = live_scheduler._scheduler.get_job(f"invite_start_lesson_{occ}")
        assert job.trigger.run_date.replace(tzinfo=None) == three_min + INVITE_START_CATCH_UP


def test_the_coach_walk_arms_one_catch_up_per_open_occurrence(app, live_scheduler, monkeypatch):
    """The burst: a coach with two classes inside their open window and nothing materialised. The
    per-coach walk (the startup re-arm and the daily pass use it) arms one catch-up for each."""
    from padel_app.models.Association_CoachLesson import Association_CoachLesson
    from padel_app.models.lessons import Lesson

    with app.app_context(), _patched():
        ids = _seed(mode="semi_automatic", invitation_start={"type": "days_before_at_time", "days": 7, "time": "19:30"},
                    reminder_hours=48, tag="two")
        first = db.session.get(Lesson, ids["lesson"])
        second = Lesson(title="P661 two b", start_datetime=CLASS_WALL + D, end_datetime=CLASS_WALL + D + H,
                        is_recurring=False, type="academy", max_players=2, color="#000", status="active",
                        club_id=first.club_id, default_level_id=first.default_level_id)
        db.session.add(second)
        db.session.flush()
        db.session.add(Association_CoachLesson(coach_id=ids["coach"], lesson_id=second.id))
        db.session.commit()

        five_days = CLASS_UTC - 5 * D
        pin_clock(monkeypatch, five_days)
        live_scheduler._schedule_lesson_occurrences_for_coach(ids["coach"])
        armed = sorted(j.id for j in live_scheduler._scheduler.get_jobs() if j.id.startswith("invite_start_lesson_"))
        assert armed == sorted([f"invite_start_lesson_{ids['lesson']}_{ids['date']}",
                                f"invite_start_lesson_{second.id}_{(CLASS_WALL + D).date().isoformat()}"])


# --- acceptance 3: when every suggestion is blocked, the coach sees why ---------------------------

def test_an_empty_suggestion_queue_says_why(app, live_scheduler, monkeypatch):
    """Semi-automatic coach, never-filled place inside the window, and the only free student is on
    the coach's excluded list (restrictions.excludedPlayers). The prompt is created (restrictions
    never block a prompt) with an EMPTY queue; the ticket's acceptance 3 wants the coach to see why.
    Expected: the vacancy payload carries the per-stage counts of the students the engine dropped."""
    from padel_app.models.lessons import Lesson
    from padel_app.models.messages import Message
    from padel_app.models.notification_config import NotificationConfig
    from padel_app.services.lesson_service import get_or_materialize_instance
    from padel_app.services.notification_service import process_invitation_batches

    with app.app_context(), _patched():
        ids = _seed(mode="semi_automatic", invitation_start={"type": "hours_before", "value": 24},
                    reminder_hours=48, tag="why")
        cfg = NotificationConfig.query.filter_by(coach_id=ids["coach"]).one()
        cfg.restrictions = {**cfg.get_restrictions(),
                            "excludedPlayers": {"enabled": True, "playerIds": [str(ids["free"])]}}
        db.session.commit()

        twelve_h = CLASS_UTC - 12 * H
        pin_clock(monkeypatch, twelve_h)
        instance = get_or_materialize_instance(db.session.get(Lesson, ids["lesson"]), CLASS_WALL.date())
        db.session.commit()
        process_invitation_batches(now=twelve_h + timedelta(minutes=2))

        state = _state(instance.id)
        assert state["prompts"] == 1 and state["approval_messages"] == 1 and state["invitations"] == 0
        msg = Message.query.filter_by(message_type="replacement_approval").one()
        (entry,) = msg.msg_metadata["vacancies"]
        assert entry["openSpot"] is True
        assert entry["queue"] == []
        assert entry.get("emptyQueueReasons") == [{"stage": "excluded_by_coach", "count": 1}], (
            "an empty queue must say why: the one free student is excluded by the coach"
        )
