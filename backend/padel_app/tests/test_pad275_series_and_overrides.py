"""PAD-275 (audit M7 / M1b / M2) — series identity, per-instance overrides,
coaches derived from the lesson.

Rules under test (numbers unconfirmed, being written by Session H):
- classes.recurrence rule 6 — series_id, whole-template copies, moved jobs  (A)
- classes.recurrence rule 7 — single-occurrence delete records an exclusion (B)
- classes.edit rule 4        — overrides are nullable columns, derived list  (C)
- classes.coach-assignment rule 4 — instance coaches from the lesson + override (D)

The code-only cases (A1, C1, C2) were the red-first tests for the pieces that
need no column. The column-dependent cases (A2, A3, B1, B2, C3, D1) were held
until decisions 9-11 of 2026-09-11 landed; they now run against
`lessons.series_id`, `lessons.excluded_dates`, `lesson_instances.max_players_override`
(migration f50214af74f1) and the coach helper `coaches_for` — decision 3 KEPT
`coach_in_lesson_instance` and added no `coach_override_id`.
"""
from datetime import timedelta

import pytest

from padel_app.sql_db import db
from padel_app.tests.test_recurring_delete_exclusion import (  # noqa: F401 (fixture)
    _events_on,
    recurring_with_coach,
)



@pytest.fixture
def live_scheduler(app):
    """An APScheduler with a memory job store, NOT started: jobs sit in the
    pending list, which `get_jobs()`, `remove_job()` and `job.remove()` all
    honour. `init_scheduler` deliberately skips tests, so this wires the module
    globals directly and clears them afterwards."""
    from apscheduler.jobstores.memory import MemoryJobStore
    from apscheduler.schedulers.background import BackgroundScheduler

    from padel_app import scheduler as sched

    sched._scheduler = BackgroundScheduler(jobstores={"default": MemoryJobStore()}, timezone="UTC")
    sched._app = app
    try:
        yield sched
    finally:
        sched._scheduler = None
        sched._app = None


def _job_ids(sched, lesson_id=None):
    prefix = "reminder_lesson_" + (f"{lesson_id}_" if lesson_id is not None else "")
    return sorted(j.id for j in sched._scheduler.get_jobs() if j.id.startswith(prefix))


def _lesson(lesson_id):
    from padel_app.models.lessons import Lesson

    return db.session.get(Lesson, lesson_id)


# ---------------------------------------------------------------------------
# C — overrides are nullable columns (code-only part)
# ---------------------------------------------------------------------------

def test_c1_materialising_does_not_copy_the_title_so_a_rename_reaches_the_instance(app, recurring_with_coach):
    """classes.edit rule 4: `overwrite_title` is written only when it differs
    from the lesson's title. A plain materialisation leaves it NULL, and the
    instance's title follows the series when the coach renames it."""
    _coach_id, _user_id, lesson_id, first_start = recurring_with_coach
    from padel_app.services.lesson_service import get_or_materialize_instance

    with app.app_context():
        lesson = _lesson(lesson_id)
        lesson.title = "Segunda 10h"
        lesson.save()

        instance = get_or_materialize_instance(lesson, (first_start + timedelta(weeks=1)).date())
        assert instance.overwrite_title is None, (
            f"materialisation copied the title: overwrite_title={instance.overwrite_title!r}"
        )
        assert instance.title == "Segunda 10h"
        instance_id = instance.id

    with app.app_context():
        lesson = _lesson(lesson_id)
        lesson.title = "Segunda 10h30"
        lesson.save()
        from padel_app.models.lesson_instances import LessonInstance

        instance = db.session.get(LessonInstance, instance_id)
        assert instance.title == "Segunda 10h30", "the series rename did not reach the occurrence"


def test_a1_a_fork_copies_every_template_column(app, recurring_with_coach):
    """classes.recurrence rule 6: `duplicate_lesson_helper` copies the whole
    template — today it drops `description` and `notifications_enabled`."""
    _coach_id, _user_id, lesson_id, _first_start = recurring_with_coach
    from padel_app.services.lesson_service import duplicate_lesson_helper

    with app.app_context():
        lesson = _lesson(lesson_id)
        lesson.description = "bring two balls"
        lesson.notifications_enabled = False
        lesson.save()

        copy = duplicate_lesson_helper(lesson)
        assert copy.description == "bring two balls"
        assert copy.notifications_enabled is False
        # and the columns it already copied still are
        assert (copy.title, copy.type, copy.max_players, copy.club_id) == (
            lesson.title, lesson.type, lesson.max_players, lesson.club_id
        )


def test_c2_overridden_fields_is_derived_from_the_non_null_overrides(app, recurring_with_coach):
    """classes.edit rule 4: the class-instance payload's `overriddenFields` lists
    exactly the overrides the occurrence carries — [] for a plain
    materialisation, ["title"] after a single-occurrence rename."""
    _coach_id, _user_id, lesson_id, first_start = recurring_with_coach
    from padel_app.serializers.lesson import serialize_class_instance
    from padel_app.services.lesson_service import edit_class_service, get_or_materialize_instance

    second = (first_start + timedelta(weeks=1)).date()
    third = (first_start + timedelta(weeks=2)).date()

    with app.app_context():
        lesson = _lesson(lesson_id)
        plain = get_or_materialize_instance(lesson, third)
        assert serialize_class_instance(plain)["overriddenFields"] == []

        result, status = edit_class_service({
            "event": {"model": "Lesson", "originalId": lesson_id, "date": second.isoformat()},
            "scope": "single",
            "updates": {"name": "Só esta segunda"},
        })
        assert status in (200, 201), result  # 201 when the edit materialises the occurrence
        from padel_app.models.lesson_instances import LessonInstance

        edited = db.session.get(LessonInstance, int(result["id"]))
        assert edited.overwrite_title == "Só esta segunda"
        assert serialize_class_instance(edited)["overriddenFields"] == ["title"], (
            "overriddenFields must be derived from the override columns, not a stored blob"
        )


# ---------------------------------------------------------------------------
# A — series identity (held: lessons.series_id)
# ---------------------------------------------------------------------------

def test_a2_a_fork_belongs_to_the_root_series(app, recurring_with_coach):
    _coach_id, _user_id, lesson_id, first_start = recurring_with_coach
    from padel_app.services.lesson_service import split_lesson

    with app.app_context():
        root = _lesson(lesson_id)
        # The fixture inserts the row directly (no service, no migration), so
        # `series_id` is NULL here; `series_root_id` reads that as "its own".
        assert root.series_root_id == root.id, "a lesson is its own series"
        root, fork = split_lesson(root, (first_start + timedelta(weeks=2)).date())
        assert fork.series_id == root.id
        assert fork.series_root_id == root.id
        assert root.series_root_id == root.id


def test_a3_reminder_jobs_move_to_the_fork_instead_of_being_rebuilt(app, recurring_with_coach, live_scheduler):
    coach_id, _user_id, lesson_id, first_start = recurring_with_coach
    from padel_app.services.lesson_service import split_lesson

    with app.app_context():
        live_scheduler.schedule_lesson_reminder_jobs(lesson_id, coach_id)
        before = _job_ids(live_scheduler)
        assert before, "the fixture lesson has occurrences inside the horizon"
        fire_before = {j.id: j.trigger.run_date for j in live_scheduler._scheduler.get_jobs()}
        split_date = (first_start + timedelta(weeks=2)).date()
        root, fork = split_lesson(_lesson(lesson_id), split_date)
        after = _job_ids(live_scheduler)
        assert len(after) == len(before), "a fork must move its occurrences' jobs, not rebuild them"
        moved = _job_ids(live_scheduler, fork.id)
        assert moved, "the fork's occurrences carry jobs keyed on the fork"
        assert all(j.split("_")[-1] >= split_date.isoformat() for j in moved)
        kept = _job_ids(live_scheduler, root.id)
        assert all(j.split("_")[-1] < split_date.isoformat() for j in kept)
        # Same fire times: moved, not recomputed.
        for job in live_scheduler._scheduler.get_jobs():
            if job.id in moved:
                old_id = job.id.replace(f"reminder_lesson_{fork.id}_", f"reminder_lesson_{root.id}_")
                assert job.trigger.run_date == fire_before[old_id]


# ---------------------------------------------------------------------------
# B — single-occurrence delete is an exclusion (held: lessons.excluded_dates)
# ---------------------------------------------------------------------------

def test_b1_deleting_one_occurrence_records_an_exclusion_and_does_not_fork(app, recurring_with_coach):
    coach_id, _user_id, lesson_id, first_start = recurring_with_coach
    from padel_app.models.lessons import Lesson
    from padel_app.services.lesson_service import remove_class_service

    second = (first_start + timedelta(weeks=1)).date()
    with app.app_context():
        lessons_before = Lesson.query.count()
        result, status = remove_class_service({
            "event": {"model": "Lesson", "originalId": lesson_id, "date": second.isoformat()},
            "scope": "single",
        })
        assert status == 200, result
        assert Lesson.query.count() == lessons_before, "a single-occurrence delete must not fork the series"
        assert second.isoformat() in (_lesson(lesson_id).excluded_dates or [])

    assert _events_on(app, coach_id, second, "Recurring Class") == []
    assert _events_on(app, coach_id, first_start.date(), "Recurring Class")
    assert _events_on(app, coach_id, (first_start + timedelta(weeks=2)).date(), "Recurring Class")


def test_b2_deleting_a_materialised_occurrence_removes_it_and_excludes_its_date(app, recurring_with_coach):
    coach_id, _user_id, lesson_id, first_start = recurring_with_coach
    from padel_app.models.lesson_instances import LessonInstance
    from padel_app.services.lesson_service import get_or_materialize_instance, remove_class_service

    second = (first_start + timedelta(weeks=1)).date()
    with app.app_context():
        instance = get_or_materialize_instance(_lesson(lesson_id), second)
        instance_id = instance.id
        result, status = remove_class_service({
            "event": {"model": "LessonInstance", "originalId": instance_id, "date": second.isoformat()},
            "scope": "single",
        })
        assert status == 200, result
        assert db.session.get(LessonInstance, instance_id) is None
        assert second.isoformat() in (_lesson(lesson_id).excluded_dates or [])
    assert _events_on(app, coach_id, second, "Recurring Class") == []


# ---------------------------------------------------------------------------
# C — capacity override (held: lesson_instances.max_players_override)
# ---------------------------------------------------------------------------

def test_c3_effective_max_players_inherits_unless_overridden(app, recurring_with_coach):
    _coach_id, _user_id, lesson_id, first_start = recurring_with_coach
    from padel_app.services.lesson_service import get_or_materialize_instance

    with app.app_context():
        lesson = _lesson(lesson_id)
        instance = get_or_materialize_instance(lesson, (first_start + timedelta(weeks=1)).date())
        assert instance.max_players_override is None
        assert instance.effective_max_players == lesson.max_players == 4
        lesson.max_players = 6
        lesson.save()
        assert instance.effective_max_players == 6, "NULL inherits the series capacity"
        instance.max_players_override = 2
        instance.save()
        assert instance.effective_max_players == 2


# ---------------------------------------------------------------------------
# D — coaches derived from the lesson (held: lesson_instances.coach_override_id)
# ---------------------------------------------------------------------------

def test_d1_instance_coaches_are_the_lessons_unless_the_occurrence_has_its_own(app, recurring_with_coach):
    """classes.coach-assignment rule 4 (decision 2026-09-11: KEEP the junction,
    no coach_override_id): `coaches_for` returns the occurrence's own coach rows
    when it has any, else the lesson's; `primary_coach` is the first. The coach
    loader finds an occurrence through either."""
    coach_id, _user_id, lesson_id, first_start = recurring_with_coach
    from datetime import datetime, time

    from padel_app.helpers.calendar_helpers import load_lesson_instances_for_coach
    from padel_app.models import User
    from padel_app.models.Association_CoachLessonInstance import Association_CoachLessonInstance
    from padel_app.models.coaches import Coach
    from padel_app.services.lesson_service import (
        coach_instance_ids,
        coaches_for,
        get_or_materialize_instance,
        primary_coach,
    )

    occ = (first_start + timedelta(weeks=1)).date()
    with app.app_context():
        sub_user = User(name="Substitute", username="pad275_sub", password="x")
        db.session.add(sub_user)
        db.session.flush()
        substitute = Coach(user_id=sub_user.id)
        db.session.add(substitute)
        db.session.commit()
        sub_id = substitute.id

        instance = get_or_materialize_instance(_lesson(lesson_id), occ)
        # Materialisation copies the lesson's coach row; strip it to model an
        # occurrence with no junction row (9 of 13 on the dev DB at audit time).
        Association_CoachLessonInstance.query.filter_by(lesson_instance_id=instance.id).delete()
        db.session.commit()
        db.session.expire(instance, ["coaches_relations"])
        assert [c.id for c in coaches_for(instance)] == [coach_id], "no junction row: the lesson's coach"
        assert primary_coach(instance).id == coach_id
        assert instance.id in coach_instance_ids(coach_id), "the engine's per-coach set sees it through the lesson"

        db.session.add(Association_CoachLessonInstance(coach_id=sub_id, lesson_instance_id=instance.id))
        db.session.commit()
        db.session.expire(instance, ["coaches_relations"])
        assert [c.id for c in coaches_for(instance)] == [sub_id], "the occurrence's own row wins"
        assert primary_coach(instance).id == sub_id
        assert instance.id in coach_instance_ids(sub_id)
        assert instance.id not in coach_instance_ids(coach_id)

        day_start = datetime.combine(occ, time.min)
        found = load_lesson_instances_for_coach(sub_id, day_start, day_start + timedelta(days=1))
        assert (lesson_id, occ) in found, "the substitute's calendar shows the occurrence"
        not_found = load_lesson_instances_for_coach(coach_id, day_start, day_start + timedelta(days=1))
        assert (lesson_id, occ) not in not_found, "the regular coach no longer runs that date"


# ---------------------------------------------------------------------------
# B — an excluded date is skipped everywhere (classes.recurrence rule 7)
# ---------------------------------------------------------------------------

def test_b3_an_excluded_date_gets_no_reminder_job_and_a_stale_one_is_pruned(app, recurring_with_coach, live_scheduler):
    coach_id, _user_id, lesson_id, first_start = recurring_with_coach
    from padel_app.services.lesson_service import remove_class_service

    second = (first_start + timedelta(weeks=1)).date()
    with app.app_context():
        live_scheduler.schedule_lesson_reminder_jobs(lesson_id, coach_id)
        assert f"reminder_lesson_{lesson_id}_{second.isoformat()}" in _job_ids(live_scheduler, lesson_id)

        result, status = remove_class_service({
            "event": {"model": "Lesson", "originalId": lesson_id, "date": second.isoformat()},
            "scope": "single",
        })
        assert status == 200, result
        # The single-occurrence removal cancels that date's job outright…
        assert f"reminder_lesson_{lesson_id}_{second.isoformat()}" not in _job_ids(live_scheduler, lesson_id)
        # …and a fresh schedule pass never re-arms it (the lesson expands itself).
        live_scheduler.schedule_lesson_reminder_jobs(lesson_id, coach_id)
        assert f"reminder_lesson_{lesson_id}_{second.isoformat()}" not in _job_ids(live_scheduler, lesson_id)
        # A job that survived from before the exclusion is pruned.
        from apscheduler.triggers.date import DateTrigger
        from datetime import datetime

        live_scheduler._scheduler.add_job(
            func=lambda: None,
            trigger=DateTrigger(run_date=datetime(2030, 1, 1), timezone="UTC"),
            id=f"reminder_lesson_{lesson_id}_{second.isoformat()}",
        )
        removed = live_scheduler.prune_lesson_reminder_jobs(lesson_id)
        assert removed == 1
        assert f"reminder_lesson_{lesson_id}_{second.isoformat()}" not in _job_ids(live_scheduler, lesson_id)


def test_b4_a_student_cannot_cancel_or_request_an_excluded_date(app, recurring_with_coach):
    """attendance.confirm rule 18 + classes.join-requests rule 2 through
    classes.recurrence rule 7: an excluded date is a date the series does not
    produce — 404, and nothing is materialised."""
    coach_id, _user_id, lesson_id, first_start = recurring_with_coach
    from werkzeug.exceptions import HTTPException

    from padel_app.models import User
    from padel_app.models.Association_PlayerLesson import Association_PlayerLesson
    from padel_app.models.lesson_instances import LessonInstance
    from padel_app.models.players import Player
    from padel_app.services.class_join_request_service import resolve_instance
    from padel_app.services.lesson_service import remove_class_service
    from padel_app.services.notification_service import _resolve_occurrence_for_student

    second = (first_start + timedelta(weeks=1)).date()
    with app.app_context():
        user = User(name="Student", username="pad275_student", password="x")
        db.session.add(user)
        db.session.flush()
        player = Player(user_id=user.id)
        db.session.add(player)
        db.session.flush()
        db.session.add(Association_PlayerLesson(player_id=player.id, lesson_id=lesson_id))
        db.session.commit()
        player_id = player.id

        result, status = remove_class_service({
            "event": {"model": "Lesson", "originalId": lesson_id, "date": second.isoformat()},
            "scope": "single",
        })
        assert status == 200, result

    with app.test_request_context():
        player = db.session.get(Player, player_id)
        with pytest.raises(HTTPException) as cancel_err:
            _resolve_occurrence_for_student(player, "Lesson", lesson_id, second.isoformat())
        assert cancel_err.value.code == 404
        with pytest.raises(HTTPException) as request_err:
            resolve_instance("Lesson", lesson_id, second.isoformat())
        assert request_err.value.code == 404
        assert LessonInstance.query.filter_by(lesson_id=lesson_id).count() == 0, "nothing was materialised"
        # The week after is still produced and still requestable.
        third = (first_start + timedelta(weeks=2)).date()
        assert _lesson(lesson_id).produces(third)


def test_b5_a_fork_and_a_created_lesson_carry_series_ids(app, recurring_with_coach):
    """classes.recurrence rule 6: a lesson created through the service is its
    own series; the code-only `duplicate_lesson_helper` copies the root's id."""
    coach_id, _user_id, lesson_id, _first_start = recurring_with_coach
    from padel_app.models.clubs import Club
    from padel_app.models.coaches import Coach
    from padel_app.services.lesson_service import add_class_service, duplicate_lesson_helper

    with app.app_context():
        coach = db.session.get(Coach, coach_id)
        club = Club.query.first()
        created = add_class_service(
            {"name": "One-off", "classType": "private", "maxPlayers": 1, "date": "2027-03-01",
             "startTime": "10:00", "endTime": "11:00", "isRecurring": False, "playerIds": []},
            coach, club,
        )
        assert created.series_id == created.id
        root = _lesson(lesson_id)
        root.series_id = root.id
        root.save()
        copy = duplicate_lesson_helper(root)
        assert copy.series_id == root.id
