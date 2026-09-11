"""PAD-275 (audit M7 / M1b / M2) — series identity, per-instance overrides,
coaches derived from the lesson.

Rules under test (numbers unconfirmed, being written by Session H):
- classes.recurrence rule 6 — series_id, whole-template copies, moved jobs  (A)
- classes.recurrence rule 7 — single-occurrence delete records an exclusion (B)
- classes.edit rule 4        — overrides are nullable columns, derived list  (C)
- classes.coach-assignment rule 4 — instance coaches from the lesson + override (D)

The code-only cases (A1, C1, C2) are RED on today's code on purpose: they are
the red-first tests for the pieces that need no column. The held cases are
skipped until the owner answers decisions 9–11 of 2026-09-11 and the columns
(`lessons.series_id`, `lessons.excluded_dates`, `lesson_instances.max_players_override`,
`lesson_instances.coach_override_id`) get their migration.
"""
from datetime import timedelta

import pytest

from padel_app.sql_db import db
from padel_app.tests.test_recurring_delete_exclusion import (  # noqa: F401 (fixture)
    _events_on,
    recurring_with_coach,
)

HELD = pytest.mark.skip(
    reason="PAD-275 held: series_id / excluded_dates / max_players_override / "
    "coach_override_id columns and their migration wait for the owner's "
    "decisions 9-11 (2026-09-11)"
)


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

@HELD
def test_a2_a_fork_belongs_to_the_root_series(app, recurring_with_coach):
    _coach_id, _user_id, lesson_id, first_start = recurring_with_coach
    from padel_app.services.lesson_service import split_lesson

    with app.app_context():
        root = _lesson(lesson_id)
        assert root.series_id == root.id, "a lesson is its own series at creation"
        root, fork = split_lesson(root, (first_start + timedelta(weeks=2)).date())
        assert fork.series_id == root.id
        assert root.series_id == root.id


@HELD
def test_a3_reminder_jobs_move_to_the_fork_instead_of_being_rebuilt(app, recurring_with_coach):
    coach_id, _user_id, lesson_id, first_start = recurring_with_coach
    from padel_app import scheduler
    from padel_app.services.lesson_service import split_lesson

    with app.app_context():
        scheduler.schedule_lesson_reminder_jobs(lesson_id, coach_id)
        before = {j.id for j in scheduler._scheduler.get_jobs() if j.id.startswith("reminder_lesson_")}
        split_date = (first_start + timedelta(weeks=2)).date()
        root, fork = split_lesson(_lesson(lesson_id), split_date)
        after = {j.id for j in scheduler._scheduler.get_jobs() if j.id.startswith("reminder_lesson_")}
        assert len(after) == len(before), "a fork must move its occurrences' jobs, not rebuild them"
        moved = {j for j in after if j.startswith(f"reminder_lesson_{fork.id}_")}
        assert moved, "the fork's occurrences carry jobs keyed on the fork"
        assert all(j.split("_")[-1] >= split_date.isoformat() for j in moved)


# ---------------------------------------------------------------------------
# B — single-occurrence delete is an exclusion (held: lessons.excluded_dates)
# ---------------------------------------------------------------------------

@HELD
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


@HELD
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

@HELD
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

@HELD
def test_d1_instance_coaches_are_the_lessons_unless_a_substitute_is_set(app, recurring_with_coach):
    coach_id, _user_id, lesson_id, first_start = recurring_with_coach
    from datetime import datetime, time

    from padel_app.helpers.calendar_helpers import load_lesson_instances_for_coach
    from padel_app.models import User
    from padel_app.models.coaches import Coach
    from padel_app.services.lesson_service import coaches_for, get_or_materialize_instance

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
        assert [c.id for c in coaches_for(instance)] == [coach_id]

        instance.coach_override_id = sub_id
        instance.save()
        assert [c.id for c in coaches_for(instance)] == [sub_id]

        day_start = datetime.combine(occ, time.min)
        found = load_lesson_instances_for_coach(sub_id, day_start, day_start + timedelta(days=1))
        assert (lesson_id, occ) in found, "the substitute's calendar shows the occurrence"
        not_found = load_lesson_instances_for_coach(coach_id, day_start, day_start + timedelta(days=1))
        assert (lesson_id, occ) not in not_found, "the regular coach no longer runs that date"
