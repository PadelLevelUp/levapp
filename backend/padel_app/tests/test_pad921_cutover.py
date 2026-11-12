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
