"""PAD-920 (dashboard.blocks NA1): a coach alert the new engine's store holds is the coach's first
needs-you item, and that class's empty-seats item is not listed too.

Clocks are pinned; 1 Nov 2026 is a Sunday, so Tuesday's read covers Thursday and Friday.
"""
from datetime import datetime

import pytest

from padel_app.invitation_engine import effects as fx
from padel_app.invitation_engine.snapshot import SpotType
from padel_app.sql_db import db
from padel_app.tests.test_pad916_engine_store import NOW, START, _seed

TUESDAY = datetime(2026, 11, 3, 10, 0)
THURSDAY = datetime(2026, 11, 5, 20, 0)
FRIDAY = datetime(2026, 11, 6, 20, 0)


@pytest.fixture(autouse=True)
def _context(app):
    with app.app_context():
        yield


def _needs_you(coach_id, user_id):
    from padel_app.helpers.dashboard.coach_home import build_needs_you_block, load_coach_home_events

    preloaded = build_needs_you_block(
        coach_id=coach_id, user_id=user_id, now=TUESDAY,
        events=load_coach_home_events(coach_id=coach_id, now=TUESDAY),
    )["data"]["items"]
    own_load = build_needs_you_block(coach_id=coach_id, user_id=user_id, now=TUESDAY)["data"]["items"]
    assert preloaded == own_load
    return preloaded


@pytest.mark.criterion("DASHBOARD-BLOCKS-48")
def test_a_coach_alert_leads_the_queue_and_hides_its_empty_seats(app):
    from padel_app.models.coach_levels import CoachLevel
    from padel_app.models.coaches import Coach

    store, (thu, fri), _ = _seed(app, starts=(THURSDAY, FRIDAY), side="right")
    coach = Coach.query.one()
    level = CoachLevel.query.filter_by(coach_id=coach.id).one()
    with store.unit((thu,)):
        store.apply([fx.CoachAlert(thu, TUESDAY, reason="no_candidate", spot_type=SpotType("R", 1), spots=1)])
    db.session.commit()

    items = _needs_you(coach.id, coach.user_id)
    alerts = [i for i in items if i["kind"] == "engine_alert"]
    assert items[0] == {
        "kind": "engine_alert",
        "id": f"lessoninstance-{thu}",
        "lessonInstanceId": int(thu),
        "classTitle": "C",
        "date": "2026-11-05",
        "timeLabel": "20:00",
        "reason": "no_candidate",
        "side": "right",
        "levelId": level.id,
        "levelLabel": "N3",
        "level": "N3",
        "count": 1,
        "href": f"/calendar?classId=lessoninstance-{thu}&date=2026-11-05",
    }
    assert len(alerts) == 1                                         # one per session and spot type
    empty = [i["id"] for i in items if i["kind"] == "empty_seats"]
    assert empty == [f"lessoninstance-{fri}"]                       # Thursday's is hidden by its alert
    assert items[1]["kind"] == "empty_seats"

    with store.unit((thu,)):
        store.apply([fx.AlertCleared(thu, TUESDAY, SpotType("R", 1))])
    db.session.commit()

    items = _needs_you(coach.id, coach.user_id)
    assert not [i for i in items if i["kind"] == "engine_alert"]
    assert [i["id"] for i in items if i["kind"] == "empty_seats"] == [
        f"lessoninstance-{thu}", f"lessoninstance-{fri}"
    ]


@pytest.fixture()
def pushes(monkeypatch):
    """Every push the outbox delivers, by user id."""
    from padel_app.utils import expo_push, push_notifications

    out = []
    monkeypatch.setattr(push_notifications, "send_push_notification", lambda **kw: out.append(kw["user_id"]))
    monkeypatch.setattr(expo_push, "send_expo_push_to_user", lambda user_id, *a, **k: out.append(user_id))
    return out


def _send():
    from padel_app.services.engine_outbox import send_effect
    from padel_app.services.engine_store import dispatch

    return dispatch(send_effect, now=NOW)


def _messages(message_type):
    from padel_app.models import Message

    return Message.query.filter_by(message_type=message_type).order_by(Message.id).all()


@pytest.mark.criterion("DASHBOARD-BLOCKS-51")
def test_the_alert_reaches_the_coach_once_as_a_message(app, pushes):
    """Dashboard.blocks NA3 (owner decision 14): a ``CoachAlert`` sent twice is one ``engine_alert`` message in the
    coach's Assistant conversation from ``coach_no_candidate`` (the count and the side filled), its metadata
    the class, the spot type (left/right, levelId, levelLabel), the count, the class's link and its date,
    and one push to the coach; sending again adds nothing."""
    from padel_app.models import Coach

    store, (a,), _ = _seed(app)
    with store.unit((a,)):
        store.apply([fx.CoachAlert(a, NOW, reason="no_candidate", spot_type=SpotType("R", 1), spots=2)])
    _send()
    _send()
    [alert] = _messages("engine_alert")
    meta = alert.msg_metadata
    assert {k: meta[k] for k in ("engine", "lessonInstanceId", "reason", "side", "count", "date")} == {
        "engine": "new", "lessonInstanceId": int(a), "reason": "no_candidate", "side": "right", "count": 2,
        "date": START.date().isoformat()}
    assert meta["levelId"] and meta["levelLabel"] and meta["href"].startswith("/calendar?")
    assert "2 vaga(s) por preencher (lado direito)" in alert.text and "{" not in alert.text
    assert pushes == [db.session.get(Coach, store.coach_of(a)).user_id]
