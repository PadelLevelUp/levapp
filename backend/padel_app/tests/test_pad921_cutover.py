"""notifications.config rule 18, the cutover (PAD-921, swap plan §7): a switched coach's sessions drain
from the old engine to the new one.

The old engine never acts on a new-engine session; no old-engine job is armed for one; at drain the
coach's remaining old jobs are removed; the engine's tick materialises a switched coach's recurring
occurrences; ``flask engine drain-state`` reports how far a coach has drained. The coach and its classes
come from the switch tests' helpers (``test_engine_switch``).
"""
from datetime import timedelta

import pytest

from padel_app.sql_db import db
from padel_app.tests.test_engine_switch import LATER, _classes, _context, _instance  # noqa: F401 - the fixture
from padel_app.tests.test_pad916_engine_store import NOW


def _vacancy(session, coach_id, **fields):
    """An old-engine vacancy on ``session``, open, as one left from before the switch."""
    from padel_app.models.vacancy import Vacancy

    vacancy = Vacancy(lesson_instance_id=int(session), coach_id=coach_id, status="open", **fields)
    db.session.add(vacancy)
    db.session.commit()
    return vacancy


def _events(session):
    from padel_app.models.notification_event import NotificationEvent

    return NotificationEvent.query.filter_by(lesson_instance_id=int(session)).count()


@pytest.mark.criterion("NOTIFICATIONS-CONFIG-81")
def test_the_old_engine_never_acts_on_a_new_engine_session(app):
    """An open old-engine vacancy left on an occurrence that now has an engine session row: the old tick
    (``process_invitation_batches``) and an old decline or approval job firing for it send, open and
    close nothing for that occurrence; the coach's old-engine occurrence is processed as today."""
    from padel_app.models.vacancy import Vacancy
    from padel_app.services.engine_switch import engine_for, switch_coach
    from padel_app.services.notification_service import process_invitation_batches, send_next_on_decline_for
    from padel_app.services.replacement_approval_service import create_vacancy_approval_prompt

    store, coach_id, opened, not_opened = _classes(app)
    switch_coach(coach_id, now=NOW)
    assert (engine_for(_instance(opened)), engine_for(_instance(not_opened))) == ("old", "new")
    leftover = _vacancy(not_opened, coach_id, approval_status="not_required")
    pending = _vacancy(not_opened, coach_id, approval_status="pending")
    draining = _vacancy(opened, coach_id, approval_status="not_required")

    process_invitation_batches(now=NOW)
    process_invitation_batches(now=LATER - timedelta(hours=12))      # its window is open by now
    send_next_on_decline_for(leftover.id)
    assert create_vacancy_approval_prompt(pending.id, coach_id) is None

    for vacancy in (leftover, pending):
        db.session.refresh(vacancy)
        assert (vacancy.status, vacancy.last_activity_at, vacancy.invite_not_before) == ("open", None, None)
    assert _events(not_opened) == 0
    db.session.refresh(draining)
    assert draining.last_activity_at is not None and _events(opened) > 0      # the old engine, as today
    assert Vacancy.query.filter_by(lesson_instance_id=int(not_opened)).count() == 2   # none opened


@pytest.mark.criterion("NOTIFICATIONS-CONFIG-82")
def test_the_calendar_reads_engines_in_one_query(app):
    """A switched coach's calendar week of 20 new-engine occurrences reads their engines in one
    engine_sessions query (engine_switch.new_engine_ids), whatever the number of classes."""
    from datetime import timedelta as _td

    from sqlalchemy import event

    from padel_app.models.coaches import Coach
    from padel_app.models.notification_config import NotificationConfig
    from padel_app.services.lesson_service import get_lesson_instances_in_range
    from padel_app.sql_db import db as _db
    from padel_app.tests.test_pad916_engine_store import NOW as _NOW, START as _START, _seed

    with app.app_context():
        starts = tuple(_START + _td(days=d // 4, hours=d % 4) for d in range(20))
        store, sessions, _ = _seed(app, starts=starts)
        coach_id = store.coach_of(sessions[0])
        _db.session.add(NotificationConfig(coach_id=coach_id, auto_notify_enabled=True, engine_version="new",
                                           engine_switched_at=_NOW))
        _db.session.commit()

        statements = []
        listen = lambda conn, cursor, sql, params, context, many: statements.append(sql)  # noqa: E731
        event.listen(_db.engine, "before_cursor_execute", listen)
        try:
            events = get_lesson_instances_in_range(_db.session.get(Coach, coach_id), _START - _td(days=1),
                                                   _START + _td(days=7))
        finally:
            event.remove(_db.engine, "before_cursor_execute", listen)
        assert len([e for e in events if e.get("engineVersion") == "new"]) == 20
        assert len([s for s in statements if "FROM engine_sessions" in s]) == 1
