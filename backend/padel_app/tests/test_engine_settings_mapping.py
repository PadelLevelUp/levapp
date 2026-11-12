"""notifications.config rule 19 (PAD-913): what a new-engine coach's stored configuration does to the
engine. The store's half here (PAD-916): a session the coach or class turned off is never listed
(CONFIG-54); the app's gates on the pool (CONFIG-53) are in ``test_pad916_engine_store.py``. The mapping to
``EngineSettings`` (CONFIG-52, CONFIG-55) is ``engine_store.settings_for`` (PAD-917).
"""
from datetime import timedelta

import pytest

from padel_app.sql_db import db
from padel_app.tests.test_pad916_engine_store import START, _seed


@pytest.fixture(autouse=True)
def _context(app):
    with app.app_context():
        yield


@pytest.mark.criterion("NOTIFICATIONS-CONFIG-54")
def test_sessions_turned_off_are_not_listed(app):
    """notifications.config rule 19 (CONFIG-54): the coach's automatic invitations off, or a class's
    own auto_invites or notifications off, and the store lists none of those sessions."""
    from padel_app.models.lesson_instances import LessonInstance
    from padel_app.models.notification_config import NotificationConfig

    store, (a, b, c), _ = _seed(app, starts=(START, START + timedelta(hours=1), START + timedelta(hours=2)))
    coach_id = store.coach_of(a)
    assert store.sessions() == ()                                   # no config: the coach's switch is off
    db.session.add(NotificationConfig(coach_id=coach_id, auto_notify_enabled=True))
    db.session.commit()
    assert store.sessions() == (a, b, c)
    db.session.get(LessonInstance, int(b)).auto_invites = False
    db.session.get(LessonInstance, int(c)).notifications_enabled = False
    db.session.commit()
    assert store.sessions() == (a,)
    NotificationConfig.query.filter_by(coach_id=coach_id).one().auto_notify_enabled = False
    db.session.commit()
    assert store.sessions() == ()
