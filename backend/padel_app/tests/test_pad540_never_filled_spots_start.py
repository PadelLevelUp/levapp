"""
PAD-540 — a never-filled spot is invited only if a one-shot job happens to be armed.

The engine opens a class's never-filled places (`_create_structural_vacancies`) only from
`trigger_invitations`, and for a class with no absence the only caller of that is the
`invite_start_<instance>` DateTrigger. That job is derived in `schedule_instance_jobs`, so it
needs a MATERIALISED occurrence, and `_reconcile_date_job` arms it only for a fire time still
in the future. An absence-created vacancy has an event path of its own (the absence writes the
row; the 2-minute tick starts it). A never-filled spot has none: when the window opens before
an instance with a future invite time exists, nobody is ever invited.

Cells 1 and 2 were red on staging 7db0e3f4a (0 vacancies, 0 invitations) and pin the fix
(invitations rule 1c): a lesson-level `invite_start_lesson_<lesson>_<date>` job beside the reminder
one, and the tick opening never-filled places of materialised classes inside their window. Cells 3
and 4 are controls that prove the seed and the engine. Then: the pair test (materialising leaves one
start job), the expired-vacancy guard, and the Postgres race cell (a tick and a trigger at once).
Dates are in 2027 so the real clock never overtakes the pinned one (wall-clock-tests-fail-overnight).
Summer: Lisbon is UTC+1, so wall 18:00 is 17:00 UTC.
"""
import contextlib
import os
import threading
from datetime import datetime, timedelta
from unittest.mock import patch

import pytest

from padel_app.sql_db import db
from padel_app.tests.helpers import pin_clock

pytestmark = pytest.mark.usefixtures("no_test_may_hang")

POSTGRES_ONLY = pytest.mark.skipif(
    os.getenv("LEVAPP_TEST_DB", "sqlite").strip().lower() != "postgres",
    reason="a lock is only visible with two real connections",
)

PATCHES = (
    "padel_app.services.notification_service.publish",
    "padel_app.services.notification_service.send_push_notification",
    "padel_app.utils.expo_push.send_expo_push_to_user",
)

CLASS_WALL = datetime(2027, 7, 12, 18, 0)        # Monday 18:00 Lisbon
CLASS_UTC = datetime(2027, 7, 12, 17, 0)
H = timedelta(hours=1)


def _seed(*, invite_hours: int, reminder_hours: int | None, tag: str):
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
        "firstReminder": ({"type": "none"} if reminder_hours is None
                          else {"type": "hours_before", "value": reminder_hours}),
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


def test_cell_1_a_window_that_opens_before_the_reminder_still_invites(app, live_scheduler, monkeypatch):
    """Invitations start 72 h before, the first reminder 48 h before, the occurrence not materialised.
    Before rule 1c nothing fired at 72 h and the reminder at 48 h materialised the occurrence with
    its invite time already past (red on 7db0e3f4a: 0 vacancies, 0 invitations). Now the lesson-level
    start job fires at 72 h, materialises and invites; the reminder arms no second start."""
    from padel_app.services.notification_service import process_invitation_batches

    with app.app_context(), patch(PATCHES[0]), patch(PATCHES[1]), patch(PATCHES[2]):
        ids = _seed(invite_hours=72, reminder_hours=48, tag="c1")
        four_days = CLASS_UTC - 96 * H
        pin_clock(monkeypatch, four_days)
        live_scheduler.schedule_lesson_reminder_jobs(ids["lesson"], ids["coach"], now=four_days)
        occ = f"{ids['lesson']}_{ids['date']}"
        assert _jobs(live_scheduler, "reminder_lesson_") == [f"reminder_lesson_{occ}"]
        start_job = live_scheduler._scheduler.get_job(f"invite_start_lesson_{occ}")
        assert start_job is not None, "the occurrence has no lesson-level invitation-start job"
        assert start_job.trigger.run_date.replace(tzinfo=None) == CLASS_UTC - 72 * H
        assert _instance_for(ids) is None

        # The window opens at 72 h: the lesson-level job materialises the occurrence and starts it.
        window = CLASS_UTC - 72 * H
        pin_clock(monkeypatch, window)
        _run(live_scheduler, f"invite_start_lesson_{occ}")
        instance = _instance_for(ids)
        assert instance is not None, "the start job did not materialise the occurrence"
        assert _vacancies_for_class(instance.id) == 1
        assert _invites_for_class(instance.id) == 1
        assert live_scheduler._scheduler.get_job(f"invite_start_lesson_{occ}") is None, (
            "the lesson-level start job survived materialisation"
        )

        # The reminder at 48 h reminds the enrolled student and starts nothing more.
        at_reminder = CLASS_UTC - 48 * H + timedelta(minutes=1)
        pin_clock(monkeypatch, at_reminder)
        assert _jobs(live_scheduler, "reminder_") == [f"reminder_{instance.id}"], "one reminder job, the instance's"
        _run(live_scheduler, f"reminder_{instance.id}")
        for hours in (47, 24, 2):
            t = CLASS_UTC - hours * H
            pin_clock(monkeypatch, t)
            process_invitation_batches(now=t)
        assert _vacancies_for_class(instance.id) == 1
        assert _invites_for_class(instance.id) == 1


def test_cell_2_a_class_materialised_inside_its_window_is_opened_by_the_tick(app, live_scheduler, monkeypatch):
    """Default timings (reminder 48 h, invitations 24 h). The occurrence is materialised 12 h before
    the class (created late, reminders rule 22, or opened by the coach): the invite time is past, so
    `schedule_instance_jobs` arms nothing. Red on 7db0e3f4a. Now the next tick opens the place, and a
    second tick sends nothing more for it."""
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

        process_invitation_batches(now=twelve_h + timedelta(minutes=2))
        assert _vacancies_for_class(instance.id) == 1, "the tick did not open the never-filled place"
        assert _invites_for_class(instance.id) == 1

        for hours in (11, 6, 2):
            t = CLASS_UTC - hours * H
            pin_clock(monkeypatch, t)
            process_invitation_batches(now=t)
        assert _vacancies_for_class(instance.id) == 1
        assert _invites_for_class(instance.id) == 1


def test_the_tick_waits_for_the_window(app, live_scheduler, monkeypatch):
    """The scan is not "any free place": a class materialised 30 h out with a 24 h window is left
    alone until the window opens."""
    from padel_app.models.lessons import Lesson
    from padel_app.services.lesson_service import get_or_materialize_instance
    from padel_app.services.notification_service import process_invitation_batches

    with app.app_context(), patch(PATCHES[0]), patch(PATCHES[1]), patch(PATCHES[2]):
        ids = _seed(invite_hours=24, reminder_hours=48, tag="w")
        thirty_h = CLASS_UTC - 30 * H
        pin_clock(monkeypatch, thirty_h)
        instance = get_or_materialize_instance(db.session.get(Lesson, ids["lesson"]), CLASS_WALL.date())
        db.session.commit()
        process_invitation_batches(now=thirty_h)
        assert _vacancies_for_class(instance.id) == 0
        process_invitation_batches(now=CLASS_UTC - 24 * H)
        assert _vacancies_for_class(instance.id) == 1


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


def test_materialising_leaves_one_start_job(app, live_scheduler, monkeypatch):
    """Rule 1c, the reminders rule 20 shape: once the occurrence exists, `invite_start_<instance>` is
    its only start job; the lesson-level one is removed, so the two never both fire. Cancelling the
    series' occurrence jobs removes both families."""
    from padel_app.models.lessons import Lesson
    from padel_app.services.lesson_service import get_or_materialize_instance

    with app.app_context(), patch(PATCHES[0]), patch(PATCHES[1]), patch(PATCHES[2]):
        ids = _seed(invite_hours=24, reminder_hours=48, tag="pair")
        four_days = CLASS_UTC - 96 * H
        pin_clock(monkeypatch, four_days)
        live_scheduler.schedule_lesson_reminder_jobs(ids["lesson"], ids["coach"], now=four_days)
        occ = f"{ids['lesson']}_{ids['date']}"
        assert _jobs(live_scheduler, "invite_start_") == [f"invite_start_lesson_{occ}"]

        instance = get_or_materialize_instance(db.session.get(Lesson, ids["lesson"]), CLASS_WALL.date())
        db.session.commit()
        assert _jobs(live_scheduler, "invite_start_") == [f"invite_start_{instance.id}"], (
            "materialising must leave the instance job as the only start job"
        )
        assert _jobs(live_scheduler, "reminder_") == [f"reminder_{instance.id}"]

        # The daily walk, run again, does not bring the lesson-level pair back for a materialised date.
        live_scheduler.schedule_lesson_reminder_jobs(ids["lesson"], ids["coach"], now=four_days)
        assert _jobs(live_scheduler, "invite_start_") == [f"invite_start_{instance.id}"]


def test_with_reminders_off_the_window_asks_nobody_on_the_roster(app, live_scheduler, monkeypatch):
    """Rule 1c: the lesson-level start job materialises the occurrence, and materialising enrols the
    roster, which arms a late ask per student when no reminder is ahead (PAD-331). With reminders
    off that would ask everyone the instant the window opened. The job touches never-filled
    places only."""
    with app.app_context(), patch(PATCHES[0]), patch(PATCHES[1]), patch(PATCHES[2]):
        ids = _seed(invite_hours=72, reminder_hours=None, tag="noask")
        four_days = CLASS_UTC - 96 * H
        pin_clock(monkeypatch, four_days)
        live_scheduler.schedule_lesson_reminder_jobs(ids["lesson"], ids["coach"], now=four_days)
        occ = f"{ids['lesson']}_{ids['date']}"
        assert _jobs(live_scheduler, "reminder_lesson_") == [], "reminders off: no reminder job"
        assert _jobs(live_scheduler, "invite_start_lesson_") == [f"invite_start_lesson_{occ}"]

        window = CLASS_UTC - 72 * H
        pin_clock(monkeypatch, window)
        _run(live_scheduler, f"invite_start_lesson_{occ}")
        instance = _instance_for(ids)
        assert instance is not None
        assert _invites_for_class(instance.id) == 1
        assert _jobs(live_scheduler, "ask_") == [], (
            "materialising from the start job armed a roster-wide ask"
        )


def test_cancelling_and_moving_the_series_jobs_takes_both_families(app, live_scheduler, monkeypatch):
    with app.app_context(), patch(PATCHES[0]), patch(PATCHES[1]), patch(PATCHES[2]):
        ids = _seed(invite_hours=24, reminder_hours=48, tag="mv")
        four_days = CLASS_UTC - 96 * H
        pin_clock(monkeypatch, four_days)
        live_scheduler.schedule_lesson_reminder_jobs(ids["lesson"], ids["coach"], now=four_days)
        occ = f"{ids['lesson']}_{ids['date']}"
        assert live_scheduler.move_lesson_reminder_jobs(ids["lesson"], 999_540) == 2
        assert _jobs(live_scheduler, "invite_start_lesson_999540") == [f"invite_start_lesson_999540_{ids['date']}"]
        assert _jobs(live_scheduler, "reminder_lesson_999540") == [f"reminder_lesson_999540_{ids['date']}"]
        live_scheduler.cancel_lesson_reminder_jobs(999_540)
        assert _jobs(live_scheduler, "invite_start_lesson_") == []
        assert _jobs(live_scheduler, "reminder_lesson_") == []
        assert occ  # the original ids are gone with the move


def test_the_tick_does_not_reopen_a_class_whose_vacancy_expired(app, live_scheduler, monkeypatch):
    """"No vacancy of any status": a place whose vacancy ran out of rounds stays closed (rule 16's
    hold and rule 13 decide its fate, not this scan)."""
    from padel_app.models.lessons import Lesson
    from padel_app.models.vacancy import Vacancy
    from padel_app.services.lesson_service import get_or_materialize_instance
    from padel_app.services.notification_service import process_invitation_batches

    with app.app_context(), patch(PATCHES[0]), patch(PATCHES[1]), patch(PATCHES[2]):
        ids = _seed(invite_hours=24, reminder_hours=48, tag="exp")
        twelve_h = CLASS_UTC - 12 * H
        pin_clock(monkeypatch, twelve_h)
        instance = get_or_materialize_instance(db.session.get(Lesson, ids["lesson"]), CLASS_WALL.date())
        db.session.add(Vacancy(lesson_instance_id=instance.id, coach_id=ids["coach"], status="expired",
                               current_round_number=2, current_batch_number=1))
        db.session.commit()
        process_invitation_batches(now=twelve_h)
        assert _vacancies_for_class(instance.id) == 1
        assert _invites_for_class(instance.id) == 0


# ── Postgres only: a tick and a start racing on one class open it once ─────────────────────────

def _race(app, targets):
    errors = []

    def wrap(fn):
        def run():
            try:
                with app.app_context(), patch(PATCHES[0]), patch(PATCHES[1]), patch(PATCHES[2]):
                    fn()
                    db.session.remove()
            except BaseException as exc:  # noqa: BLE001 — surfaced below
                errors.append(exc)
        return threading.Thread(target=run)

    threads = [wrap(fn) for fn in targets]
    for t in threads:
        t.start()
    for t in threads:
        t.join(timeout=60)
    assert not any(t.is_alive() for t in threads), "a caller never finished (lock never released?)"
    assert not errors, errors


@contextlib.contextmanager
def _both_counted_before_the_lock(monkeypatch):
    """Hold each caller after it has counted the free places (outside the lock) and before it takes
    the class lock, until the other has counted too — so both believe one place is missing unless
    the recount under the lock (PAD-261) tells the second otherwise."""
    from padel_app.services import notification_service as ns

    real = ns._lock_instance
    gate = threading.Barrier(2)

    def gated(instance):
        try:
            gate.wait(timeout=1.5)
        except threading.BrokenBarrierError:
            pass
        return real(instance)

    monkeypatch.setattr(ns, "_lock_instance", gated)
    yield


@POSTGRES_ONLY
def test_a_tick_and_a_trigger_at_once_open_the_class_once(app, live_scheduler, monkeypatch):
    from padel_app.models.lesson_instances import LessonInstance
    from padel_app.models.lessons import Lesson
    from padel_app.services.lesson_service import get_or_materialize_instance
    from padel_app.services.notification_service import process_invitation_batches, trigger_invitations

    twelve_h = CLASS_UTC - 12 * H
    pin_clock(monkeypatch, twelve_h)
    with app.app_context():
        ids = _seed(invite_hours=24, reminder_hours=48, tag="race")
        instance = get_or_materialize_instance(db.session.get(Lesson, ids["lesson"]), CLASS_WALL.date())
        db.session.commit()
        instance_id, coach_id = instance.id, ids["coach"]

    def tick():
        process_invitation_batches(now=twelve_h)

    def start():
        trigger_invitations(db.session.get(LessonInstance, instance_id), coach_id, now=twelve_h)

    with _both_counted_before_the_lock(monkeypatch):
        _race(app, [tick, start])

    with app.app_context():
        assert _vacancies_for_class(instance_id) == 1, "the race created the place twice"
        assert _invites_for_class(instance_id) == 1


def test_a_scan_that_raises_does_not_stop_the_ticks_open_vacancies(app, monkeypatch):
    """#558 review: the scan runs before the per-vacancy loop. One failure in it (its candidate
    query included) is logged, and an existing open vacancy still gets its first batch."""
    from padel_app.models.lessons import Lesson
    from padel_app.models.vacancy import Vacancy
    from padel_app.services import notification_service as ns
    from padel_app.services.lesson_service import get_or_materialize_instance

    def boom(*, now):
        raise RuntimeError("scan failed")

    with app.app_context(), patch(PATCHES[0]), patch(PATCHES[1]), patch(PATCHES[2]):
        ids = _seed(invite_hours=24, reminder_hours=48, tag="boom")
        twelve_h = CLASS_UTC - 12 * H
        pin_clock(monkeypatch, twelve_h)
        instance = get_or_materialize_instance(db.session.get(Lesson, ids["lesson"]), CLASS_WALL.date())
        db.session.add(Vacancy(lesson_instance_id=instance.id, coach_id=ids["coach"], status="open",
                               current_round_number=1, current_batch_number=0))
        db.session.commit()
        monkeypatch.setattr(ns, "_open_never_filled_places", boom)

        ns.process_invitation_batches(now=twelve_h)
        assert _invites_for_class(instance.id) == 1, "the scan's failure stopped the tick"
