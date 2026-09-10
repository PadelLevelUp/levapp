"""
PAD-256, class-request slots (classes.class-requests rules 1, 7 and 8; R-023;
decision 2026-09-10-class-time-storage, option B).

A slot is the Lisbon wall-clock time the student chose. The module's single
clock, `_now_wall_clock`, returned UTC. So from April to October, today's free
blocks started up to an hour in the past, and a slot that had already started
was accepted. With the clock on the club's time, a service's `now` is a
wall-clock value, and `decided_at` is an event timestamp that has to be
written in UTC.

Each behaviour is pinned on a summer date (WEST, UTC+1) and a winter date (WET,
UTC+0), in 2027 so that no real clock interferes.
"""
from datetime import datetime

import pytest
from werkzeug.exceptions import HTTPException

from padel_app.sql_db import db
from padel_app.tests.test_pad104_class_requests import _coach, _player, _setup


SUMMER_NOW = datetime(2027, 7, 13, 9, 30)    # UTC; 10:30 on the club's clock
WINTER_NOW = datetime(2027, 1, 12, 9, 30)    # UTC; 09:30 on the club's clock


def _pin_utc(monkeypatch, utc_now):
    """Pin UTC now for the old clock path and the new one (club_now_naive)."""
    from padel_app.services import class_request_service
    from padel_app.utils import dates

    monkeypatch.setattr(dates, "utcnow_naive", lambda: utc_now)
    monkeypatch.setattr(class_request_service, "utcnow_naive", lambda: utc_now, raising=False)


@pytest.mark.parametrize("utc_now, wall_now", [
    (SUMMER_NOW, datetime(2027, 7, 13, 10, 30)),
    (WINTER_NOW, datetime(2027, 1, 12, 9, 30)),
])
def test_the_module_clock_is_the_club_clock(monkeypatch, utc_now, wall_now):
    from padel_app.services.class_request_service import _now_wall_clock

    _pin_utc(monkeypatch, utc_now)
    assert _now_wall_clock() == wall_now


@pytest.mark.parametrize("utc_now, first_start", [
    (SUMMER_NOW, "10:30"),   # nothing before 10:30 on the club's clock is offered
    (WINTER_NOW, "09:30"),
])
def test_todays_free_blocks_start_at_club_now(app, monkeypatch, utc_now, first_start):
    from padel_app.services.class_request_service import free_blocks

    ids = _setup(app)
    _pin_utc(monkeypatch, utc_now)
    day = utc_now.date()
    with app.app_context():
        blocks = free_blocks(_coach(ids), datetime(day.year, day.month, day.day, 0, 0),
                             datetime(day.year, day.month, day.day, 23, 59))
    today = [b for b in blocks if b["date"] == day.isoformat()]
    assert today and today[0]["startTime"] == first_start, today


@pytest.mark.parametrize("utc_now, refused", [
    (SUMMER_NOW, True),    # 10:00 has started at 10:30 Lisbon
    (WINTER_NOW, False),   # 10:00 has not started at 09:30 Lisbon
])
def test_a_started_slot_is_refused_on_the_club_clock(app, monkeypatch, utc_now, refused):
    from padel_app.services.class_request_service import create_class_request_service

    ids = _setup(app)
    _pin_utc(monkeypatch, utc_now)
    data = {"coachId": ids["coach_id"], "date": utc_now.date().isoformat(),
            "startTime": "10:00", "endTime": "11:00"}
    with app.app_context():
        if refused:
            with pytest.raises(HTTPException):
                create_class_request_service(_player(ids["player_id"]), data)
        else:
            assert create_class_request_service(_player(ids["player_id"]), data).status == "pending"


@pytest.mark.parametrize("slot_day, created_at, withdrawn_wall, decided_utc", [
    # A service's `now` is wall-clock; decided_at is the UTC instant.
    ("2027-07-20", datetime(2027, 7, 1, 10, 0), datetime(2027, 7, 2, 10, 0), datetime(2027, 7, 2, 9, 0)),
    ("2027-01-20", datetime(2027, 1, 1, 10, 0), datetime(2027, 1, 2, 10, 0), datetime(2027, 1, 2, 10, 0)),
])
def test_decided_at_is_stored_in_utc(app, slot_day, created_at, withdrawn_wall, decided_utc):
    from padel_app.models.class_request import ClassRequest
    from padel_app.services.class_request_service import (
        create_class_request_service,
        withdraw_class_request_service,
    )

    ids = _setup(app)
    with app.app_context():
        row = create_class_request_service(
            _player(ids["player_id"]),
            {"coachId": ids["coach_id"], "date": slot_day, "startTime": "11:00", "endTime": "12:00"},
            now=created_at,
        )
        withdraw_class_request_service(row.id, _player(ids["player_id"]), now=withdrawn_wall)
        assert db.session.get(ClassRequest, row.id).decided_at == decided_utc
