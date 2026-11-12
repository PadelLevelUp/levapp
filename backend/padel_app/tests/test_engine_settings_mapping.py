"""notifications.config rule 19 (PAD-913): what a new-engine coach's stored configuration does to the
engine. The store's half (PAD-916): the app's gates build ``pool`` and ``postponed`` (CONFIG-53), and
a session the coach or class turned off is never listed (CONFIG-54). The mapping to
``EngineSettings`` (CONFIG-52, CONFIG-55) is ``engine_store.settings_for`` (PAD-917).
"""
from datetime import timedelta

import pytest

from padel_app.invitation_engine import effects as fx
from padel_app.sql_db import db
from padel_app.tests.test_pad916_engine_store import NOW, START, _invited, _seed


@pytest.fixture(autouse=True)
def _context(app):
    with app.app_context():
        yield


@pytest.mark.criterion("NOTIFICATIONS-CONFIG-53")
def test_app_gates_build_the_pool_and_the_engine_bar_is_open(app):
    """A student below the class's eligibility bar, one in ``excludedPlayers`` and one with another
    class that day under ``noSameDayClass`` are not in ``pool``; one already holding the coach's
    ``maxInvitesPerStudentPerDay`` invitations today is in ``postponed``. (The engine's own bar,
    wide open, is the mapping's half: PAD-917.)"""
    from padel_app.models.Association_CoachPlayer import Association_CoachPlayer
    from padel_app.models.notification_config import NotificationConfig

    store, (a, b), (_, capped, excluded, same_day, ineligible, free) = _seed(
        app, starts=(START, START + timedelta(hours=2)), players=6)
    coach_id = store.coach_of(a)
    Association_CoachPlayer.query.filter_by(coach_id=coach_id, player_id=int(ineligible)).one().level_id = None
    config = NotificationConfig(coach_id=coach_id, auto_notify_enabled=True,
                                eligibility_rules=[{"attribute": "level", "operation": "within_n_above_class",
                                                    "value": 0}])
    config.restrictions = {"excludedPlayers": {"enabled": True, "playerIds": [excluded]},
                           "noSameDayClass": {"enabled": True},
                           "maxInvitesPerStudentPerDay": {"enabled": True, "value": 1}}
    db.session.add(config)
    db.session.commit()
    with store.unit((b,)):
        store.apply([fx.Placed(b, NOW, same_day, "L", "invitation"), _invited(b, capped)])

    s = store.snapshot(a)
    assert {st.id for st in s.pool} == {capped, free}
    assert s.postponed == {capped}

    config.restrictions = {"noSameDayClass": {"enabled": False}}       # every gate off
    config.eligibility_rules = None
    db.session.commit()
    s = store.snapshot(a)
    assert {st.id for st in s.pool} == {capped, excluded, same_day, ineligible, free}
    assert s.postponed == frozenset()


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
