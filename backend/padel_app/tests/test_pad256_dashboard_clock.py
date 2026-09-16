"""
PAD-256, dashboard windows, pending validation and the season's "today"
(dashboard.blocks rules 3 and 6, attendance.validation rule 15,
attendance.history rule 6, calendar.seasons; R-023; decision
2026-09-10-class-time-storage, option B).

The dashboard, the attendance screens and the season read "now" and "today" off
UTC (or the server's date) while class times are Lisbon wall-clock. So from
April to October:
- the hero's `minutesUntil` was an hour too long;
- a class that had started still counted as "to confirm";
- a class that had ended was not yet "pending validation";
- the pending "tomorrow" window ran 23:00-23:00;
- between 00:00 and 01:00 Lisbon, "this month", "today" and the season were
  still the previous day's.

Inside the dashboard helpers `now` is the club's wall clock (like the
class-request module). Each behaviour is pinned on a summer date (WEST, UTC+1)
and a winter date (WET, UTC+0), in 2027.
"""
from dataclasses import asdict
from datetime import date, datetime, time, timedelta, timezone
from types import SimpleNamespace

import pytest

from padel_app.sql_db import db


def _pin_utc(monkeypatch, utc_now, *modules):
    """Pin UTC now for the new clock (club_now_naive) and for any module that
    still reads utcnow_naive directly (today's code)."""
    from padel_app.utils import dates

    monkeypatch.setattr(dates, "utcnow_naive", lambda: utc_now)
    for module in modules:
        monkeypatch.setattr(module, "utcnow_naive", lambda: utc_now, raising=False)


# ── the pending "tomorrow" window is the next Lisbon day, in wall terms ────

@pytest.mark.parametrize("utc_now, window", [
    # 23:30 UTC on 07-12 is 00:30 Lisbon on 07-13, so tomorrow is 07-14.
    (datetime(2027, 7, 12, 23, 30), (datetime(2027, 7, 14), datetime(2027, 7, 15))),
    (datetime(2027, 1, 11, 23, 30), (datetime(2027, 1, 12), datetime(2027, 1, 13))),
])
def test_pending_tomorrow_window_is_in_wall_terms(utc_now, window):
    from padel_app.helpers.dashboard.pending import _tomorrow_window

    assert _tomorrow_window(utc_now) == window


# ── the hero counts minutes on the club's clock ─────────────────────────────

HERO = [
    # UTC 09:30 is 10:30 Lisbon in July, 09:30 in January; the seed puts the
    # class 45 minutes after the wall-clock "now" it is given.
    (datetime(2027, 7, 13, 9, 30), datetime(2027, 7, 13, 10, 30)),
    (datetime(2027, 1, 12, 9, 30), datetime(2027, 1, 12, 9, 30)),
]


@pytest.mark.parametrize("utc_now, wall_now", HERO)
def test_coach_hero_minutes_until_uses_the_club_clock(app, monkeypatch, utc_now, wall_now):
    from test_dashboard_coach_home import _seed

    from padel_app.helpers.dashboard import coach_home
    from padel_app.helpers.dashboard.coach_home import build_next_class_block

    coach_id, _user_id, _soon = _seed(app, now=wall_now)
    _pin_utc(monkeypatch, utc_now, coach_home)
    with app.app_context():
        data = build_next_class_block(coach_id=coach_id)["data"]
    assert (data["isToday"], data["minutesUntil"]) == (True, 45)


@pytest.mark.parametrize("utc_now, wall_now", HERO)
def test_player_hero_minutes_until_uses_the_club_clock(app, monkeypatch, utc_now, wall_now):
    from test_dashboard_player_home import _seed

    from padel_app.helpers.dashboard import player_home
    from padel_app.helpers.dashboard.player_home import build_player_next_class_block

    student_id, _user_id, _soon = _seed(app, now=wall_now)
    _pin_utc(monkeypatch, utc_now, player_home)
    with app.app_context():
        data = build_player_next_class_block(player_id=student_id)["data"]
    assert (data["isToday"], data["minutesUntil"]) == (True, 45)


# ── "to confirm" stops counting a class that has started ──────────────────

def _frozen_datetime(utc_now):
    class Frozen(datetime):
        @classmethod
        def now(cls, tz=None):
            aware = utc_now.replace(tzinfo=timezone.utc)
            return aware.astimezone(tz) if tz is not None else utc_now
    return Frozen


@pytest.mark.parametrize("utc_now, wall_start, to_confirm", [
    (datetime(2027, 7, 13, 9, 30), datetime(2027, 7, 13, 10, 0), 0),   # started at 10:00 Lisbon
    (datetime(2027, 1, 12, 9, 30), datetime(2027, 1, 12, 10, 0), 1),   # starts in 30 minutes
])
def test_kpi_to_confirm_uses_the_club_clock(app, monkeypatch, utc_now, wall_start, to_confirm):
    from test_pad256_cancel_windows import _seed

    from padel_app.helpers.dashboard import kpis
    from padel_app.models.presences import Presence

    with app.app_context():
        instance_id, _user_id, player_id = _seed(wall_start)
        presence = Presence.query.filter_by(lesson_instance_id=instance_id, player_id=player_id).one()
        presence.status, presence.invited, presence.confirmed = None, True, False
        db.session.commit()
        _pin_utc(monkeypatch, utc_now)
        monkeypatch.setattr(kpis, "datetime", _frozen_datetime(utc_now))
        values = {k: v for k, v in asdict(kpis.compute_player_kpis(player_id=player_id)).items() if "confirm" in k.lower()}
    assert list(values.values()) == [to_confirm], values


# ── pending validation starts when the class ends on the club's clock ──────

@pytest.mark.parametrize("utc_now, wall_start, pending", [
    # A 10:00-11:00 class at 10:30 UTC: 11:30 Lisbon in July (ended), 10:30 in January.
    (datetime(2027, 7, 13, 10, 30), datetime(2027, 7, 13, 10, 0), 1),
    (datetime(2027, 1, 12, 10, 30), datetime(2027, 1, 12, 10, 0), 0),
])
def test_pending_validation_cutoff_uses_the_club_clock(app, utc_now, wall_start, pending):
    from test_pad256_cancel_windows import _seed

    from padel_app.models.Association_CoachLesson import Association_CoachLesson
    from padel_app.models.lesson_instances import LessonInstance
    from padel_app.services.presence_overview_service import count_pending_validation

    with app.app_context():
        instance_id, _user_id, _player_id = _seed(wall_start)
        instance = db.session.get(LessonInstance, instance_id)
        coach_id = Association_CoachLesson.query.filter_by(lesson_id=instance.lesson_id).one().coach_id
        day = datetime.combine(wall_start.date(), time.min)
        count = count_pending_validation(coach_id=coach_id, range_start=day,
                                         range_end=day + timedelta(hours=23, minutes=59),
                                         now=utc_now.replace(tzinfo=timezone.utc))
    assert count == pending


# ── default ranges and "today" roll over at Lisbon midnight ────────────────

@pytest.mark.parametrize("utc_now, month", [
    # 23:30 UTC on 07-31 is already 00:30 on 08-01 in Lisbon.
    (datetime(2027, 7, 31, 23, 30), (datetime(2027, 8, 1), datetime(2027, 8, 31, 23, 59, 59))),
    (datetime(2027, 1, 31, 23, 30), (datetime(2027, 1, 1), datetime(2027, 1, 31, 23, 59, 59))),
])
def test_attendance_history_default_month_is_the_clubs(utc_now, month):
    from padel_app.services.attendance_history_service import default_range

    assert default_range(utc_now.replace(tzinfo=timezone.utc)) == month


@pytest.mark.parametrize("utc_now, last_day", [
    (datetime(2027, 7, 12, 23, 30), datetime(2027, 7, 13, 23, 59, 59)),
    (datetime(2027, 1, 11, 23, 30), datetime(2027, 1, 11, 23, 59, 59)),
])
def test_presence_overview_default_range_ends_on_the_clubs_day(utc_now, last_day):
    from padel_app.services.presence_overview_service import default_overview_range

    assert default_overview_range(utc_now.replace(tzinfo=timezone.utc))[1] == last_day


@pytest.mark.parametrize("utc_now, season_start", [
    # A 1 Aug - 31 Jul season: at 00:30 Lisbon on 2027-08-01 the new one has begun.
    (datetime(2027, 7, 31, 23, 30), date(2027, 8, 1)),
    (datetime(2027, 1, 31, 23, 30), date(2026, 8, 1)),
])
def test_season_today_is_the_clubs_date(monkeypatch, utc_now, season_start):
    from padel_app.services.season_service import current_or_upcoming_occurrence

    _pin_utc(monkeypatch, utc_now)
    definition = SimpleNamespace(start_month=8, start_day=1, end_month=7, end_day=31, label="Season")
    assert current_or_upcoming_occurrence(definition)[0] == season_start
