"""PAD-927 — classes.availability rule 2: the wizard reads the whole recurrence in one call, so the
read's range is the weekly request's own bound (366 days, classes.class-requests rule 14). With the
old 62-day cap, 10 weekly lessons (63 days or more) were refused 400 and shown as "no time is free".

The wizard asks `to = endDateAfterClasses(startDate, weekdays, N)` (@levelup/config
recurrence-end.ts); one weekday of that arithmetic is mirrored here.
"""
from datetime import timedelta

import pytest

from padel_app.tests.test_pad357_availability_and_requests import TUE, _world


def _tuesdays(start, count):
    first = start + timedelta(days=(2 - start.isoweekday()) % 7)
    return [first + timedelta(weeks=i) for i in range(count)]


def _headers(app, ids):
    from flask_jwt_extended import create_access_token

    app.config["JWT_SECRET_KEY"] = "test-jwt-secret"
    with app.app_context():
        return {"Authorization": f"Bearer {create_access_token(identity=str(ids['bruno_user_id']))}"}


def _get(client, headers, ids, start, end):
    return client.get(
        f"/api/app/availability?coachId={ids['coach_id']}&from={start.isoformat()}&to={end.isoformat()}",
        headers=headers,
    )


@pytest.mark.criterion("CLASSES-AVAILABILITY-6")
# From the first lesson's own day, and from the day after a Tuesday (the widest lead-in).
@pytest.mark.parametrize("lead", [0, 1])
@pytest.mark.parametrize("lessons", [9, 10, 52])
def test_a_weekly_read_answers_with_every_date_free(app, client, lessons, lead):
    ids = _world(app)
    start = TUE + timedelta(days=lead)
    dates = _tuesdays(start, lessons)
    res = _get(client, _headers(app, ids), ids, start, dates[-1])
    assert res.status_code == 200, res.get_data(as_text=True)
    windows = res.get_json()["freeWindows"]
    for day in dates:
        assert windows[day.isoformat()] == [{"startTime": "08:00", "endTime": "22:00"}], day


@pytest.mark.criterion("CLASSES-AVAILABILITY-6")
def test_a_range_over_366_days_is_refused(app, client):
    ids = _world(app)
    headers = _headers(app, ids)
    assert _get(client, headers, ids, TUE, TUE + timedelta(days=366)).status_code == 200
    assert _get(client, headers, ids, TUE, TUE + timedelta(days=367)).status_code == 400
