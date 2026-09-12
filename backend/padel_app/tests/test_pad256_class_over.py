"""
PAD-256, "has the class started" and "is it completed" (notifications.reminders
rule 10, calendar.view rule 11, eligibility.open-spot-visibility rule 7,
classes.join-requests rule 14; R-023; decision 2026-09-10-class-time-storage,
option B).

The engine, the calendar and the join-request flow compared a class's Lisbon
wall-clock start with UTC now. So from April to October, for the first hour of
a class:
- invitations, accepts and join requests still went through;
- open vacancies were not expired;
- replacement-approval prompts stayed live;
- the calendar showed a finished class as `scheduled` for an hour.

`now` stays the UTC instant; it is moved to the club's clock only where it
meets a class time. Each behaviour is pinned on a summer date (WEST, UTC+1) and
a winter date (WET, UTC+0), in 2027 so no real clock interferes.
"""
from datetime import datetime, timedelta
from types import SimpleNamespace

import pytest

from padel_app.sql_db import db
from padel_app.models import Presence


SUMMER = datetime(2027, 7, 13)
WINTER = datetime(2027, 1, 12)
BEFORE = datetime(2026, 12, 1)


def at(day, hour, minute=0):
    return day.replace(hour=hour, minute=minute)


# 09:30 UTC is 10:30 Lisbon in July (a 10:00 class has started) and 09:30 in
# January (it has not).
CASES = [(at(SUMMER, 10), at(SUMMER, 9, 30), True), (at(WINTER, 10), at(WINTER, 9, 30), False)]


@pytest.mark.parametrize("wall_start, utc_now, started", CASES)
def test_instance_is_over_uses_the_club_clock(wall_start, utc_now, started):
    from padel_app.services.notification_service import _instance_is_over

    instance = SimpleNamespace(status="scheduled", start_datetime=wall_start)
    assert _instance_is_over(instance, utc_now) is started


@pytest.mark.parametrize("wall_start, utc_now, started", CASES)
def test_join_requests_close_on_the_club_clock(wall_start, utc_now, started):
    from padel_app.services.class_join_request_service import _is_closed

    instance = SimpleNamespace(status="scheduled", start_datetime=wall_start)
    assert _is_closed(instance, utc_now) is started


@pytest.mark.parametrize("day, utc_now, status", [
    # A 10:00-11:00 class at 10:30 UTC: 11:30 Lisbon in July (over), 10:30 in January.
    (SUMMER, at(SUMMER, 10, 30), "completed"),
    (WINTER, at(WINTER, 10, 30), "scheduled"),
])
def test_calendar_status_uses_the_club_clock(day, utc_now, status):
    from padel_app.serializers.calendar_event import _compute_status

    assert _compute_status(at(day, 10), at(day, 11), now=utc_now) == status


@pytest.mark.parametrize("wall_start, utc_now, started", CASES)
def test_open_vacancies_expire_when_the_class_starts(app, wall_start, utc_now, started):
    from test_pad256_invite_window import _world_at
    from test_semi_auto_approval import _patched_io

    from padel_app.models.vacancy import Vacancy
    from padel_app.services.notification_service import process_invitation_batches

    with app.app_context():
        world = _world_at(f"vx{wall_start:%Y%m}", wall_start, {"type": "hours_before", "value": 24})
        vacancy = Vacancy(lesson_instance_id=world["instance"].id, coach_id=world["coach"].id,
                          status="open", approval_status="pending",
                          current_round_number=1, current_batch_number=0)
        db.session.add(vacancy)
        db.session.commit()
        with _patched_io():
            process_invitation_batches(now=utc_now)
        assert db.session.get(Vacancy, vacancy.id).status == ("expired" if started else "open")


@pytest.mark.parametrize("wall_start, utc_now, started", CASES)
def test_a_replacement_prompt_goes_stale_when_the_class_starts(app, wall_start, utc_now, started):
    from test_pad256_invite_window import _world_at
    from test_semi_auto_approval import _create_pending_prompt, _patched_io

    from padel_app.services.replacement_approval_service import respond_to_approval

    with app.app_context():
        world = _world_at(f"st{wall_start:%Y%m}", wall_start, {"type": "hours_before", "value": 24})
        _user, declined = world["enrolled"][0]
        _vacancy, _prompt, bundle = _create_pending_prompt(world, declined, now=BEFORE)
        with _patched_io():
            result = respond_to_approval(bundle["bundleId"], "yes_now", world["coach"].id, now=utc_now)
        assert result["vacancies"][0]["result"] == ("stale" if started else "approved_now")


def _class_at(ids, wall_start):
    """Put the PAD-128 seed's class (and its template) at `wall_start`, one-off."""
    from padel_app.models.lesson_instances import LessonInstance

    instance = db.session.get(LessonInstance, ids["instance_id"])
    for obj in (instance, instance.lesson):
        obj.start_datetime = wall_start
        obj.end_datetime = wall_start + timedelta(hours=1)
    instance.lesson.is_recurring = False
    instance.original_lesson_occurence_date = wall_start.date()
    db.session.commit()
    return instance


@pytest.mark.parametrize("wall_start, utc_now, started", CASES)
def test_a_class_under_way_is_not_offered_as_an_open_spot(app, wall_start, utc_now, started):
    from test_pad130_open_spots import _config, _student

    from padel_app.helpers.calendar_helpers import load_open_spot_events_for_player
    from padel_app.tests.test_pad128_eligibility import _seed

    ids = _seed(app, eligibility_rules=None)
    _config(app, ids, open_spots_visible=True)
    pid = _student(app, ids, "looker")
    with app.app_context():
        _class_at(ids, wall_start)
        day = wall_start.replace(hour=0, minute=0)
        events = load_open_spot_events_for_player(pid, day, day + timedelta(hours=23, minutes=59), now=utc_now)
    if started:
        assert events == []
    else:
        assert [e["id"] for e in events], events


@pytest.mark.parametrize("wall_start, start_iso", [
    (at(SUMMER, 10), "2027-07-13T09:00:00+00:00"),
    (at(WINTER, 10), "2027-01-12T10:00:00+00:00"),
])
def test_the_eligibility_note_sends_the_real_start_instant(app, wall_start, start_iso):
    from padel_app.models.Association_PlayerLessonInstance import Association_PlayerLessonInstance
    from padel_app.services.notification_service import students_failing_eligibility_bar
    from padel_app.tests.test_pad128_eligibility import _add_student, _seed

    ids = _seed(app, eligibility_rules=None, max_players=6)
    with app.app_context():
        instance = _class_at(ids, wall_start)
        bad = _add_student(ids["coach_id"], "bad", ids["level_ids"]["5-"])
        db.session.add(Association_PlayerLessonInstance(player_id=bad, lesson_instance_id=instance.id))
        db.session.add(Presence(player_id=bad, lesson_instance_id=instance.id, invited=True, enrolment_source="coach"))  # PAD-259
        db.session.commit()
        affected = students_failing_eligibility_bar(
            ids["coach_id"], [{"attribute": "level", "operation": "same_as_class"}], now=BEFORE)
    # The client formats this in Europe/Lisbon, so it must be the true instant.
    assert [a["startDatetime"] for a in affected] == [start_iso]
