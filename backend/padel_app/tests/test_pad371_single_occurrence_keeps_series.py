"""
PAD-371 / bug B-139 — changing ONE occurrence of a recurring calendar block must
leave the rest of the series alone.

`_split_block` shortened the series (`recurrence_end = occ_date - 1 day`) and only
THEN asked `_next_occurrence_after` where to resume — a search bounded by the end it
had just shortened, so it found nothing and no resumed series was ever created:
deleting or moving one middle occurrence silently dropped every later one.

The same helper called itself "exclusive" but searched from MIDNIGHT of the date, so
the occurrence later that same day counted as "next": deleting the FIRST occurrence
"advanced" the start to where it already was (a 204 that removed nothing), and
moving it left the original in place beside the moved copy.

Every case goes through the HTTP routes the two shells call
(`DELETE /api/app/calendar_block/<id>`, `POST /api/app/reschedule_block/<id>`), on a
weekly Thursday series with fixed dates — no wall clock anywhere.

Covered spec: calendar.blocks rules 6, 8 and 9.
"""
import json
from datetime import date, datetime, timezone

import pytest
from flask_jwt_extended import create_access_token

from padel_app.sql_db import db

# Thursdays: 2026-10-01, 08, 15, 22, 29. JS weekday convention (Thursday = 4).
RULE = json.dumps({"frequency": "weekly", "daysOfWeek": [4]})
OCT = ["2026-10-01", "2026-10-08", "2026-10-15", "2026-10-22", "2026-10-29"]
AT_10 = [f"{d} 10:00" for d in OCT]


@pytest.fixture(autouse=True)
def _jwt_secret(app):
    app.config["JWT_SECRET_KEY"] = "test-jwt-secret"


def _auth_header(app, user_id):
    with app.app_context():
        token = create_access_token(identity=str(user_id))
    return {"Authorization": f"Bearer {token}"}


def _series(app, *, recurrence_end=date(2026, 10, 29)):
    """A user owning a weekly Thursday 10:00–11:00 block from 2026-10-01. Returns (user_id, block_id)."""
    from padel_app.models import User
    from padel_app.models.calendar_blocks import CalendarBlock

    with app.app_context():
        user = User(name="Series Owner", username="pad371_owner", password="x")
        db.session.add(user)
        db.session.flush()
        block = CalendarBlock(
            user_id=user.id,
            type="personal",
            title="PAD-371 series",
            start_datetime=datetime(2026, 10, 1, 10, 0),
            end_datetime=datetime(2026, 10, 1, 11, 0),
            is_recurring=True,
            recurrence_rule=RULE,
            recurrence_end=recurrence_end,
        )
        db.session.add(block)
        db.session.commit()
        return user.id, block.id


def _occurrences(app, user_id, until="2026-11-30"):
    """Every occurrence the user's blocks produce up to `until`, as 'YYYY-MM-DD HH:MM', sorted."""
    from padel_app.models.calendar_blocks import CalendarBlock
    from padel_app.tools.calendar_tools import expand_occurrences

    lo = datetime(2026, 9, 1, tzinfo=timezone.utc)
    hi = datetime.fromisoformat(f"{until}T23:59:59").replace(tzinfo=timezone.utc)
    out = []
    with app.app_context():
        for b in CalendarBlock.query.filter_by(user_id=user_id).all():
            if b.is_recurring:
                occs = expand_occurrences(b.start_datetime, b.recurrence_rule, b.recurrence_end, lo, hi)
                out += [f"{o.date().isoformat()} {b.start_datetime:%H:%M}" for o in occs]
            else:
                out.append(f"{b.start_datetime:%Y-%m-%d %H:%M}")
    return sorted(out)


def _delete(client, app, user_id, block_id, occ_date, scope):
    res = client.delete(
        f"/api/app/calendar_block/{block_id}",
        headers=_auth_header(app, user_id),
        json={"occDate": occ_date, "scope": scope},
    )
    assert res.status_code == 204, res.data


def _move(client, app, user_id, block_id, occ_date, scope, *, new_date=None, start="15:00", end="16:00"):
    res = client.post(
        f"/api/app/reschedule_block/{block_id}",
        headers=_auth_header(app, user_id),
        json={"occDate": occ_date, "newDate": new_date or occ_date,
              "newStartTime": start, "newEndTime": end, "scope": scope},
    )
    assert res.status_code == 204, res.data


def test_the_fixture_series_is_the_five_thursdays(app):
    user_id, _ = _series(app)
    assert _occurrences(app, user_id) == AT_10


# ── delete one occurrence ────────────────────────────────────────────────────

def test_deleting_one_middle_occurrence_keeps_every_later_one(client, app):
    """The regression: Oct 22 and Oct 29 vanished with Oct 15."""
    user_id, block_id = _series(app)
    _delete(client, app, user_id, block_id, "2026-10-15", "single")
    assert _occurrences(app, user_id) == [AT_10[0], AT_10[1], AT_10[3], AT_10[4]]


def test_the_resumed_series_keeps_the_original_end(client, app):
    from padel_app.models.calendar_blocks import CalendarBlock

    user_id, block_id = _series(app)
    _delete(client, app, user_id, block_id, "2026-10-15", "single")
    with app.app_context():
        rows = CalendarBlock.query.filter_by(user_id=user_id).order_by(CalendarBlock.start_datetime).all()
        assert [(r.start_datetime.date(), r.recurrence_end) for r in rows] == [
            (date(2026, 10, 1), date(2026, 10, 14)),
            (date(2026, 10, 22), date(2026, 10, 29)),
        ]


def test_deleting_the_last_occurrence_resumes_nothing(client, app):
    """The other half of the 2×2: here 'no resumed series' is the right answer."""
    from padel_app.models.calendar_blocks import CalendarBlock

    user_id, block_id = _series(app)
    _delete(client, app, user_id, block_id, "2026-10-29", "single")
    assert _occurrences(app, user_id) == AT_10[:4]
    with app.app_context():
        assert CalendarBlock.query.filter_by(user_id=user_id).count() == 1


def test_deleting_the_first_occurrence_removes_it(client, app):
    """Was a 204 that removed nothing: 'next after Oct 1' found Oct 1 10:00 itself."""
    user_id, block_id = _series(app)
    _delete(client, app, user_id, block_id, "2026-10-01", "single")
    assert _occurrences(app, user_id) == AT_10[1:]


def test_deleting_one_occurrence_of_an_endless_series_keeps_it_endless(client, app):
    from padel_app.models.calendar_blocks import CalendarBlock

    user_id, block_id = _series(app, recurrence_end=None)
    _delete(client, app, user_id, block_id, "2026-10-15", "single")
    occs = _occurrences(app, user_id, until="2026-11-12")
    assert "2026-10-15 10:00" not in occs
    assert occs[-3:] == ["2026-10-29 10:00", "2026-11-05 10:00", "2026-11-12 10:00"]
    with app.app_context():
        resumed = CalendarBlock.query.filter_by(user_id=user_id).order_by(CalendarBlock.start_datetime.desc()).first()
        assert resumed.recurrence_end is None


def test_deleting_the_only_occurrence_left_deletes_the_block(client, app):
    from padel_app.models.calendar_blocks import CalendarBlock

    user_id, block_id = _series(app, recurrence_end=date(2026, 10, 1))
    _delete(client, app, user_id, block_id, "2026-10-01", "single")
    with app.app_context():
        assert CalendarBlock.query.filter_by(user_id=user_id).count() == 0


# ── move one occurrence ──────────────────────────────────────────────────────

def test_moving_one_middle_occurrence_keeps_every_later_one(client, app):
    """calendar.blocks criterion 'Reschedule block': ONLY that occurrence moves."""
    user_id, block_id = _series(app)
    _move(client, app, user_id, block_id, "2026-10-15", "single")
    assert _occurrences(app, user_id) == [AT_10[0], AT_10[1], "2026-10-15 15:00", AT_10[3], AT_10[4]]


def test_moving_the_first_occurrence_does_not_leave_the_original_behind(client, app):
    user_id, block_id = _series(app)
    _move(client, app, user_id, block_id, "2026-10-01", "single")
    assert _occurrences(app, user_id) == ["2026-10-01 15:00", *AT_10[1:]]


# ── "this and following" still behaves as designed ───────────────────────────

def test_deleting_this_and_following_ends_the_series_there(client, app):
    user_id, block_id = _series(app)
    _delete(client, app, user_id, block_id, "2026-10-15", "future")
    assert _occurrences(app, user_id) == AT_10[:2]


def test_moving_this_and_following_moves_the_rest_of_the_series(client, app):
    user_id, block_id = _series(app)
    _move(client, app, user_id, block_id, "2026-10-15", "future")
    assert _occurrences(app, user_id) == [
        AT_10[0], AT_10[1], "2026-10-15 15:00", "2026-10-22 15:00", "2026-10-29 15:00",
    ]
