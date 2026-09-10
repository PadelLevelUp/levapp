"""
PAD-256, the invitation window (notifications.invitations rule 10,
semi-auto-approval rule 8, invite-simulation gates; R-023; decision
2026-09-10-class-time-storage, option B).

The invitation start was computed from a class's Lisbon wall-clock start as if
that start were UTC. So from April to October:
- the window opened an hour late;
- `Vacancy.invite_not_before` held that late moment, or a real UTC instant in
  the day-before mode, so its meaning depended on the coach's config;
- `minTimeBeforeClass` counted 60 minutes too many;
- the semi-auto card showed the window time an hour off in the day-before mode.

Each behaviour is pinned on a summer date (WEST, UTC+1) and a winter date (WET,
UTC+0). The dates are in 2027 so that the helpers that treat a past class as
over leave these classes alone.
"""
from datetime import datetime, timedelta
from types import SimpleNamespace
from unittest.mock import patch

import pytest

from padel_app.sql_db import db


SUMMER = datetime(2027, 7, 13)   # WEST (UTC+1)
WINTER = datetime(2027, 1, 12)   # WET (UTC+0)
BEFORE = datetime(2026, 12, 1)   # "now" for the DB tests: before every class and window


def at(day, hour, minute=0):
    return day.replace(hour=hour, minute=minute)


# ── when the window opens ───────────────────────────────────────────────────

@pytest.mark.parametrize("wall_start, timing, opens_utc", [
    (at(SUMMER, 14), {"type": "hours_before", "value": 24}, datetime(2027, 7, 12, 13, 0)),
    (at(WINTER, 14), {"type": "hours_before", "value": 24}, datetime(2027, 1, 11, 14, 0)),
    # Day-before at 18:00 for a late class lands on the class's own day before.
    (at(SUMMER, 23, 30), {"type": "days_before_at_time", "days": 1, "time": "18:00"}, datetime(2027, 7, 12, 17, 0)),
    (at(WINTER, 23, 30), {"type": "days_before_at_time", "days": 1, "time": "18:00"}, datetime(2027, 1, 11, 18, 0)),
])
def test_invitation_window_opens_on_the_club_clock(wall_start, timing, opens_utc):
    from padel_app.scheduler import _compute_invite_start_dt

    assert _compute_invite_start_dt(SimpleNamespace(start_datetime=wall_start), timing) == opens_utc


# ── minTimeBeforeClass counts real minutes ──────────────────────────────────

@pytest.mark.parametrize("wall_start, utc_now, allowed", [
    # 08:30 UTC is 09:30 Lisbon in July: 30 real minutes before a 10:00 class.
    (at(SUMMER, 10), datetime(2027, 7, 13, 8, 30), False),
    # 08:30 UTC is 08:30 Lisbon in January: 90 real minutes before.
    (at(WINTER, 10), datetime(2027, 1, 12, 8, 30), True),
])
def test_min_time_before_class_counts_real_minutes(wall_start, utc_now, allowed):
    import copy

    from padel_app.models.notification_config import DEFAULT_RESTRICTIONS
    from padel_app.services.notification_service import _check_restrictions

    restrictions = copy.deepcopy(DEFAULT_RESTRICTIONS)
    restrictions["minTimeBeforeClass"] = {"enabled": True, "value": 60}
    restrictions["maxTotal"] = {"enabled": False, "value": 10}
    instance = SimpleNamespace(id=1, start_datetime=wall_start, status="scheduled", max_players=4,
                               notifications_enabled=True, players_relations=[], presences=[])
    with patch("padel_app.services.notification_service.NotificationEvent") as mock_event:
        mock_event.query.filter_by.return_value.filter.return_value.count.return_value = 0
        assert _check_restrictions(instance, coach_id=1, restrictions=restrictions, now=utc_now) is allowed


# ── semi-automatic approval and the simulation ─────────────────────────────

def _world_at(prefix, wall_start, invitation_timing):
    from test_semi_auto_approval import _seed_world

    world = _seed_world(prefix, n_candidates=1)
    instance = world["instance"]
    for obj in (instance, instance.lesson):
        obj.start_datetime = wall_start
        obj.end_datetime = wall_start + timedelta(hours=1)
    instance.original_lesson_occurence_date = wall_start.date()
    world["config"].invitation_start_timing = invitation_timing
    db.session.commit()
    return world


@pytest.mark.parametrize("wall_start, window_wall", [
    (at(SUMMER, 10), "2027-07-12T18:00:00"),
    (at(WINTER, 10), "2027-01-11T18:00:00"),
])
def test_window_open_at_is_sent_on_the_club_wall_clock(app, wall_start, window_wall):
    from test_semi_auto_approval import _create_pending_prompt

    with app.app_context():
        world = _world_at(f"woa{wall_start:%Y%m}", wall_start,
                          {"type": "days_before_at_time", "days": 1, "time": "18:00"})
        _user, declined = world["enrolled"][0]
        _vacancy, _prompt, bundle = _create_pending_prompt(world, declined, now=BEFORE)
        assert bundle["windowOpenAt"] == window_wall


@pytest.mark.parametrize("wall_start, not_before_utc", [
    # 24 h before a 10:00 July class (09:00 UTC) is 09:00 UTC the day before.
    (at(SUMMER, 10), datetime(2027, 7, 12, 9, 0)),
    (at(WINTER, 10), datetime(2027, 1, 11, 10, 0)),
])
def test_yes_at_window_stores_the_utc_instant(app, wall_start, not_before_utc):
    from test_semi_auto_approval import _create_pending_prompt, _patched_io

    from padel_app.models.vacancy import Vacancy
    from padel_app.services.replacement_approval_service import respond_to_approval

    with app.app_context():
        world = _world_at(f"yaw{wall_start:%Y%m}", wall_start, {"type": "hours_before", "value": 24})
        _user, declined = world["enrolled"][0]
        vacancy, _prompt, bundle = _create_pending_prompt(world, declined, now=BEFORE)
        with _patched_io():
            result = respond_to_approval(bundle["bundleId"], "yes_at_window", world["coach"].id, now=BEFORE)
        assert result["vacancies"][0]["result"] == "approved_at_window"
        assert Vacancy.query.get(vacancy.id).invite_not_before == not_before_utc


@pytest.mark.parametrize("wall_start, opens_at", [
    (at(SUMMER, 14), "2027-07-12T13:00:00"),
    (at(WINTER, 14), "2027-01-11T14:00:00"),
])
def test_simulation_reports_the_window_as_a_utc_instant(app, wall_start, opens_at):
    from padel_app.services.invite_simulation_service import _gates

    with app.app_context():
        world = _world_at(f"sim{wall_start:%Y%m}", wall_start, {"type": "hours_before", "value": 24})
        gates = {g["code"]: g for g in _gates(world["instance"], world["config"], BEFORE)}
        assert gates["invitation_window"]["opensAt"] == opens_at
