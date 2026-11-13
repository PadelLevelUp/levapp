"""
B-727 — splitting a student's recurring blocker must keep the rest of it a blocker.

Deleting one occurrence (`scope: "single"`) or moving one (`/reschedule_block`) splits the
series: `_split_block` shortens the row and `_clone_block` writes the rest as a new row.
`_clone_block` copied every column but `blocks_auto_invitations`, which defaults to false, so
the continuation stopped counting as a blocker for everything that filters on the flag:
- the live engine's predicate `blocked_user_ids_for_window` (eligibility, manual send,
  reminders, the delivery backstop);
- the new engine's store, `engine_store.TableStore._own_blocks`, which calls the same
  predicate and tags the student `availability_blocker`;
- the student's own list (`list_student_blockers`).

Fixed dates, no wall clock (pattern of test_pad377_one_off_edit_ends_the_series.py).

Covered spec: calendar.student-blockers CALENDAR-STUDENT-BLOCKERS-14 (rules 3, 5).
"""
import json
from datetime import date, datetime
from types import SimpleNamespace

import pytest
from flask_jwt_extended import create_access_token

from padel_app.sql_db import db

# Mondays: 2026-10-05, 12, 19, 26. JS weekday convention (Monday = 1).
RULE = json.dumps({"frequency": "weekly", "daysOfWeek": [1]})


@pytest.fixture(autouse=True)
def _jwt_secret(app):
    app.config["JWT_SECRET_KEY"] = "test-jwt-secret"


def _auth_header(app, user_id):
    with app.app_context():
        token = create_access_token(identity=str(user_id))
    return {"Authorization": f"Bearer {token}"}


def _student_weekly_blocker(app):
    """A student owning a weekly Monday 10:00–11:00 blocker, 2026-10-05 → 2026-10-26.
    Returns (user_id, player_id, block_id)."""
    from padel_app.models import Player, User
    from padel_app.models.calendar_blocks import CalendarBlock

    with app.app_context():
        user = User(name="B727 Student", username="b727_student", email="b727_student@test.com", password="x")
        db.session.add(user)
        db.session.flush()
        player = Player(user_id=user.id)
        db.session.add(player)
        block = CalendarBlock(
            user_id=user.id,
            type="unavailable",
            title="Away",
            start_datetime=datetime(2026, 10, 5, 10, 0),
            end_datetime=datetime(2026, 10, 5, 11, 0),
            is_recurring=True,
            recurrence_rule=RULE,
            recurrence_end=date(2026, 10, 26),
            blocks_auto_invitations=True,
        )
        db.session.add(block)
        db.session.commit()
        return user.id, player.id, block.id


def _window(day):
    return datetime(2026, 10, day, 10, 15), datetime(2026, 10, day, 10, 45)


def _blocked_live(app, user_id, day):
    """The live engine's predicate (eligibility, manual, reminders, backstop)."""
    from padel_app.services.student_availability_service import blocked_user_ids_for_window

    with app.app_context():
        return user_id in blocked_user_ids_for_window([user_id], *_window(day))


def _blocked_new_engine(app, user_id, player_id, day):
    """The new engine's store: the codes `_own_blocks` gives the student for a session that day."""
    from padel_app.models import User
    from padel_app.services.engine_store import TableStore

    with app.app_context():
        start, end = _window(day)
        inst = SimpleNamespace(start_datetime=start, end_datetime=end)
        links = [SimpleNamespace(player_id=player_id)]
        own = TableStore._own_blocks(inst, links, {player_id: db.session.get(User, user_id)})
        return "availability_blocker" in own[str(player_id)]


def _listed_rows(client, app, user_id):
    res = client.get("/api/app/availability_blockers", headers=_auth_header(app, user_id))
    assert res.status_code == 200, res.data
    return res.get_json()


DELETE_ROUTES = ["/api/app/availability_blockers/{id}", "/api/app/calendar_block/{id}"]


@pytest.mark.criterion("CALENDAR-STUDENT-BLOCKERS-14")
@pytest.mark.parametrize("route", DELETE_ROUTES)
def test_deleting_one_occurrence_keeps_the_rest_blocking_the_live_engine(client, app, route):
    user_id, _, block_id = _student_weekly_blocker(app)
    assert _blocked_live(app, user_id, 19) is True

    res = client.delete(route.format(id=block_id), headers=_auth_header(app, user_id),
                        json={"scope": "single", "occDate": "2026-10-12"})
    assert res.status_code == 204, res.data

    assert _blocked_live(app, user_id, 12) is False
    assert _blocked_live(app, user_id, 19) is True
    assert _blocked_live(app, user_id, 26) is True
    rows = _listed_rows(client, app, user_id)
    assert len(rows) == 2
    assert all(r["blocksAutoInvitations"] is True for r in rows)


@pytest.mark.criterion("CALENDAR-STUDENT-BLOCKERS-14")
def test_deleting_one_occurrence_keeps_the_rest_blocking_the_new_engine(client, app):
    user_id, player_id, block_id = _student_weekly_blocker(app)
    assert _blocked_new_engine(app, user_id, player_id, 19) is True

    res = client.delete(f"/api/app/availability_blockers/{block_id}", headers=_auth_header(app, user_id),
                        json={"scope": "single", "occDate": "2026-10-12"})
    assert res.status_code == 204, res.data

    assert _blocked_new_engine(app, user_id, player_id, 12) is False
    assert _blocked_new_engine(app, user_id, player_id, 19) is True


@pytest.mark.criterion("CALENDAR-STUDENT-BLOCKERS-14")
def test_moving_one_occurrence_keeps_both_the_moved_one_and_the_rest_blocking(client, app):
    """`/reschedule_block` scope single writes the moved occurrence as a one-off clone and splits the
    series: both new rows are still the student's unavailability."""
    user_id, _, block_id = _student_weekly_blocker(app)

    res = client.post(f"/api/app/reschedule_block/{block_id}", headers=_auth_header(app, user_id),
                      json={"occDate": "2026-10-12", "newDate": "2026-10-13",
                            "newStartTime": "10:00", "newEndTime": "11:00", "scope": "single"})
    assert res.status_code == 204, res.data

    assert _blocked_live(app, user_id, 12) is False
    assert _blocked_live(app, user_id, 13) is True
    assert _blocked_live(app, user_id, 19) is True
    rows = _listed_rows(client, app, user_id)
    assert len(rows) == 3
    assert all(r["blocksAutoInvitations"] is True for r in rows)
