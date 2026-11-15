"""Swap plan §3.2 (PAD-918): two more readers of the old engine's tables read the new engine's rows
for a new-engine session: presence signals (when an invitation reached a student) and the academy
waiting list's "was shown this class by an invitation"."""
from datetime import timedelta

import pytest

from padel_app.invitation_engine import effects as fx
from padel_app.invitation_engine.snapshot import SpotType
from padel_app.sql_db import db
from padel_app.tests.test_pad916_engine_store import NOW, START, _seed


def _invite(store, session, student):
    level = store.snapshot(session).level
    with store.unit((session,)):
        store.apply([fx.Invited(session, NOW, student, frozenset({SpotType("R", level)}), None, 2,
                                NOW + timedelta(minutes=20))])


@pytest.mark.criterion("NOTIFICATIONS-CONFIG-50")
def test_presence_signals_date_a_new_engine_invitation(app):
    from padel_app.models.lesson_instances import LessonInstance
    from padel_app.models.presences import Presence
    from padel_app.services.presence_signal_service import reminder_sent_at_by_presence

    with app.app_context():
        store, (s,), (_, invited, _) = _seed(app)
        _invite(store, s, invited)
        presence = Presence(player_id=int(invited), lesson_instance_id=int(s), enrolment_source="fill")
        db.session.add(presence)
        db.session.commit()
        assert reminder_sent_at_by_presence([presence]) == {presence.id: NOW}


@pytest.mark.criterion("NOTIFICATIONS-CONFIG-50")
def test_a_student_the_new_engine_invited_counts_as_shown_the_class(app):
    from padel_app.services.academy_class_service import _was_invited

    with app.app_context():
        store, (s,), (_, invited, never) = _seed(app)
        _invite(store, s, invited)
        assert _was_invited(int(s), int(invited)) is True
        assert _was_invited(int(s), int(never)) is False
        with store.unit((s,)):
            store.apply([fx.Answered(s, NOW, invited, "no", "invitation")])
        assert _was_invited(int(s), int(invited)) is False          # their own No grants nothing (rule 18)
