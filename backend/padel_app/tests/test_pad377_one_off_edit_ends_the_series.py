"""
PAD-377 / bug B-150 — a recurring calendar block edited to a ONE-OFF must stop
repeating.

`edit_event_service` hands the form layer `recurrence_rule: ""` and
`recurrence_end: ""` for a one-off, and the form layer drops empty values, so the old
rule and end date stayed on the row. The response said `isRecurring: false`, and
everything that reads the RULE kept treating the block as weekly:
- the calendar feed went on serving it every week;
- the invitation engine (`blocked_user_ids_for_window` expands `recurrence_rule` and
  never looks at the flag) went on skipping a student every week for an
  unavailability they had reduced to one day.

And `_build_payload` read `data.get("isRecurring", False)`, so an edit whose body
simply OMITS the key flipped the flag of a block that is still meant to be weekly.
The rule now is: recurrence changes only when the body says so — explicit `false`
clears rule and end date; an absent key leaves flag, rule and end date alone.

Both edit routes are exercised (`PUT /api/app/calendar_block/<id>` and
`PUT /api/app/availability_blockers/<id>`); they share `edit_event_service`. Fixed
dates, no wall clock. The shared form layer is deliberately not touched (PAD-367).

Covered spec: calendar.blocks rule 10; calendar.student-blockers.
"""
import json
from datetime import date, datetime, timezone

import pytest
from flask_jwt_extended import create_access_token

from padel_app.sql_db import db

# Mondays: 2026-10-05, 12, 19, 26. JS weekday convention (Monday = 1).
RULE = json.dumps({"frequency": "weekly", "daysOfWeek": [1]})
MONDAYS = ["2026-10-05", "2026-10-12", "2026-10-19", "2026-10-26"]


@pytest.fixture(autouse=True)
def _jwt_secret(app):
    app.config["JWT_SECRET_KEY"] = "test-jwt-secret"


def _auth_header(app, user_id):
    with app.app_context():
        token = create_access_token(identity=str(user_id))
    return {"Authorization": f"Bearer {token}"}


def _weekly_block(app, *, student=False):
    """A user owning a weekly Monday 10:00–11:00 block, 2026-10-05 → 2026-10-26. Returns (user_id, block_id)."""
    from padel_app.models import Player, User
    from padel_app.models.calendar_blocks import CalendarBlock

    with app.app_context():
        user = User(name="Series Owner", username="pad377_owner", email="pad377_owner@test.com", password="x")
        db.session.add(user)
        db.session.flush()
        if student:
            db.session.add(Player(user_id=user.id))
        block = CalendarBlock(
            user_id=user.id,
            type="unavailable" if student else "personal",
            title="Away" if student else "PAD-377 series",
            start_datetime=datetime(2026, 10, 5, 10, 0),
            end_datetime=datetime(2026, 10, 5, 11, 0),
            is_recurring=True,
            recurrence_rule=RULE,
            recurrence_end=date(2026, 10, 26),
            blocks_auto_invitations=student,
        )
        db.session.add(block)
        db.session.commit()
        return user.id, block.id


def _row(app, block_id):
    from padel_app.models.calendar_blocks import CalendarBlock

    with app.app_context():
        b = CalendarBlock.query.get(block_id)
        return {"is_recurring": b.is_recurring, "rule": b.recurrence_rule, "end": b.recurrence_end,
                "start": b.start_datetime}


def _days_served(app, block_id):
    """The October days the block's row produces for anything that expands its rule (feed, engine)."""
    from padel_app.models.calendar_blocks import CalendarBlock
    from padel_app.tools.calendar_tools import expand_occurrences

    with app.app_context():
        b = CalendarBlock.query.get(block_id)
        occs = expand_occurrences(
            b.start_datetime, b.recurrence_rule, b.recurrence_end,
            datetime(2026, 10, 1, tzinfo=timezone.utc), datetime(2026, 10, 31, 23, 59, tzinfo=timezone.utc),
        )
        return sorted(o.date().isoformat() for o in occs)


def _blocked_on(app, user_id, day):
    from padel_app.services.student_availability_service import user_is_blocked_for_window

    with app.app_context():
        return user_is_blocked_for_window(
            user_id, datetime(2026, 10, day, 10, 15), datetime(2026, 10, day, 10, 45)
        )


ONE_OFF = {"type": "personal", "title": "PAD-377 series", "date": "2026-10-05",
           "startTime": "10:00", "endTime": "11:00", "isRecurring": False}


def test_the_fixture_repeats_on_the_four_mondays(app):
    _, block_id = _weekly_block(app)
    assert _days_served(app, block_id) == MONDAYS


# ── explicit isRecurring: false ends the series ──────────────────────────────

def test_a_block_edited_to_one_off_loses_its_rule_and_end_date(client, app):
    user_id, block_id = _weekly_block(app)
    res = client.put(f"/api/app/calendar_block/{block_id}", headers=_auth_header(app, user_id), json=ONE_OFF)
    assert res.status_code == 200, res.data
    assert res.get_json()["isRecurring"] is False
    row = _row(app, block_id)
    assert (row["is_recurring"], row["rule"], row["end"]) == (False, None, None)


def test_a_block_edited_to_one_off_is_served_on_one_day(client, app):
    """The regression: the response said one-off, the feed kept serving all four Mondays."""
    user_id, block_id = _weekly_block(app)
    client.put(f"/api/app/calendar_block/{block_id}", headers=_auth_header(app, user_id), json=ONE_OFF)
    assert _days_served(app, block_id) == ["2026-10-05"]


def test_a_students_unavailability_made_one_off_stops_excluding_them_every_week(client, app):
    """The engine reads the rule, not the flag: the student was skipped for invitations every Monday."""
    user_id, block_id = _weekly_block(app, student=True)
    assert _blocked_on(app, user_id, 19) is True

    res = client.put(
        f"/api/app/availability_blockers/{block_id}",
        headers=_auth_header(app, user_id),
        json={**ONE_OFF, "type": "unavailable", "title": "Away"},
    )
    assert res.status_code == 200, res.data
    assert _blocked_on(app, user_id, 5) is True      # the day they kept
    assert _blocked_on(app, user_id, 19) is False    # two Mondays later: free again
    assert _blocked_on(app, user_id, 20) is False    # a Tuesday: never blocked


# ── an absent key changes nothing about recurrence ───────────────────────────

def test_an_edit_that_omits_isRecurring_leaves_flag_rule_and_end_date_alone(client, app):
    """`data.get("isRecurring", False)` flipped the flag of a block still meant to be weekly."""
    user_id, block_id = _weekly_block(app)
    body = {k: v for k, v in ONE_OFF.items() if k != "isRecurring"}
    body["title"] = "Renamed, still weekly"
    res = client.put(f"/api/app/calendar_block/{block_id}", headers=_auth_header(app, user_id), json=body)
    assert res.status_code == 200, res.data
    row = _row(app, block_id)
    assert (row["is_recurring"], row["rule"], row["end"]) == (True, RULE, date(2026, 10, 26))
    assert _days_served(app, block_id) == MONDAYS


# ── recurrence that IS sent is still written ─────────────────────────────────

def test_an_edit_that_sends_a_new_rule_and_end_date_writes_them(client, app):
    user_id, block_id = _weekly_block(app)
    body = {**ONE_OFF, "isRecurring": True, "recurrenceRule": {"frequency": "weekly", "daysOfWeek": [1]},
            "endDate": "2026-10-12"}
    res = client.put(f"/api/app/calendar_block/{block_id}", headers=_auth_header(app, user_id), json=body)
    assert res.status_code == 200, res.data
    assert _row(app, block_id)["is_recurring"] is True
    assert _days_served(app, block_id) == MONDAYS[:2]


def test_a_one_off_edited_to_weekly_starts_repeating(client, app):
    user_id, block_id = _weekly_block(app)
    client.put(f"/api/app/calendar_block/{block_id}", headers=_auth_header(app, user_id), json=ONE_OFF)
    body = {**ONE_OFF, "isRecurring": True, "recurrenceRule": {"frequency": "weekly", "daysOfWeek": [1]},
            "endDate": "2026-10-26"}
    client.put(f"/api/app/calendar_block/{block_id}", headers=_auth_header(app, user_id), json=body)
    assert _days_served(app, block_id) == MONDAYS
