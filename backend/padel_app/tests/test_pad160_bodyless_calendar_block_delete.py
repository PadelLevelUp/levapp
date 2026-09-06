"""
PAD-160 / bug B-019 — `DELETE /api/app/calendar_block/<id>` must tolerate a
request with no body.

A one-off (non-recurring) calendar event has nothing to say on delete: no
`occDate`, no `scope`. The client therefore sent no body at all, and Flask's
`request.get_json()` answers **415 Unsupported Media Type** for a request whose
`Content-Type` is not JSON — it raises before the handler's `or {}` can run. The
row survived and iOS showed "Falha ao eliminar o evento".

The client now always sends `{}` (see `packages/api/src/resources/calendar.ts`),
and the handler reads the body with `silent=True` so a bodyless DELETE is still
honoured — belt and braces, because an older installed app build cannot be
patched retroactively.

Covered spec: calendar.event-detail (one-off delete)
"""
from datetime import datetime, timedelta

import pytest
from flask_jwt_extended import create_access_token

from padel_app.sql_db import db


@pytest.fixture(autouse=True)
def _jwt_secret(app):
    app.config["JWT_SECRET_KEY"] = "test-jwt-secret"


def _auth_header(app, user_id):
    with app.app_context():
        token = create_access_token(identity=str(user_id))
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def user_with_block(app):
    """A user owning one non-recurring personal block. Returns (user_id, block_id)."""
    from padel_app.models import User
    from padel_app.models.calendar_blocks import CalendarBlock

    with app.app_context():
        user = User(name="Block Owner", username="pad160_owner", password="x")
        db.session.add(user)
        db.session.flush()

        start = datetime.utcnow().replace(microsecond=0) + timedelta(days=1)
        block = CalendarBlock(
            user_id=user.id,
            type="personal",
            start_datetime=start,
            end_datetime=start + timedelta(hours=1),
            is_recurring=False,
            title="One-off event",
        )
        db.session.add(block)
        db.session.commit()
        return user.id, block.id


def _block_exists(app, block_id):
    from padel_app.models.calendar_blocks import CalendarBlock

    with app.app_context():
        return CalendarBlock.query.get(block_id) is not None


def test_delete_with_no_body_at_all_deletes_the_block(client, app, user_with_block):
    """The regression: no body, no Content-Type — used to be 415, row survived."""
    user_id, block_id = user_with_block

    res = client.delete(
        f"/api/app/calendar_block/{block_id}",
        headers=_auth_header(app, user_id),
    )

    assert res.status_code == 204, res.data
    assert not _block_exists(app, block_id)


def test_delete_with_empty_json_body_deletes_the_block(client, app, user_with_block):
    """What the fixed client now sends: `{}` with `Content-Type: application/json`."""
    user_id, block_id = user_with_block

    res = client.delete(
        f"/api/app/calendar_block/{block_id}",
        headers=_auth_header(app, user_id),
        json={},
    )

    assert res.status_code == 204, res.data
    assert not _block_exists(app, block_id)


def test_delete_still_reads_occ_date_and_scope_when_sent(client, app):
    """A recurring block still splits on `{occDate, scope}` — the body is honoured
    when it is there, only optional when it is not."""
    import json as _json
    from padel_app.models import User
    from padel_app.models.calendar_blocks import CalendarBlock

    with app.app_context():
        user = User(name="Recurring Owner", username="pad160_rec", password="x")
        db.session.add(user)
        db.session.flush()

        start = datetime.utcnow().replace(hour=10, minute=0, second=0, microsecond=0)
        start += timedelta(days=1)
        block = CalendarBlock(
            user_id=user.id,
            type="personal",
            start_datetime=start,
            end_datetime=start + timedelta(hours=1),
            is_recurring=True,
            recurrence_rule=_json.dumps(
                {"frequency": "weekly", "daysOfWeek": [(start.weekday() + 1) % 7]}
            ),
            recurrence_end=(start + timedelta(weeks=6)).date(),
            title="Recurring event",
        )
        db.session.add(block)
        db.session.commit()
        user_id, block_id = user.id, block.id
        first_date = start.date()

    res = client.delete(
        f"/api/app/calendar_block/{block_id}",
        headers=_auth_header(app, user_id),
        json={"occDate": (first_date + timedelta(weeks=2)).isoformat(), "scope": "future"},
    )

    assert res.status_code == 204, res.data
    with app.app_context():
        surviving = CalendarBlock.query.get(block_id)
        # scope=future on a later occurrence trims the series, it does not delete it
        assert surviving is not None
        assert surviving.recurrence_end == first_date + timedelta(weeks=2) - timedelta(days=1)
