"""notifications.engine-store rule 7 (PAD-918): the ``engine_tick`` job plans each session in its own
unit and goes on past a failure, which admin.engine-health rule 12 records."""
from datetime import timedelta
from unittest.mock import patch

import pytest

from padel_app.sql_db import db
from padel_app.tests.test_pad916_engine_store import NOW, START, _seed


@pytest.fixture(autouse=True)
def _context(app):
    with app.app_context():
        yield


@pytest.mark.criterion("NOTIFICATIONS-ENGINE-STORE-6")
def test_the_tick_plans_each_session_and_goes_on_past_a_failure(app):
    from padel_app.models import EngineInvitation
    from padel_app.models.delivery_incident import DeliveryIncident
    from padel_app.models.notification_config import NotificationConfig
    from padel_app.services import engine_store
    from padel_app.services.engine_runner import SESSION_FAILED, tick_sessions

    store, (failing, fine), _ = _seed(app, starts=(START, START + timedelta(hours=2)))
    db.session.add(NotificationConfig(coach_id=store.coach_of(failing), auto_notify_enabled=True))
    db.session.commit()
    real = engine_store.settings_for

    def settings_for(session):
        if session == failing:
            raise RuntimeError("a broken session")
        return real(session)

    with patch.object(engine_store, "settings_for", settings_for):
        tick_sessions(NOW, store)

    invited = {str(r.lesson_instance_id) for r in EngineInvitation.query.all()}
    assert fine in invited and failing not in invited
    incident = DeliveryIncident.query.filter_by(kind=SESSION_FAILED).one()
    assert (incident.channel, incident.subject_type, incident.subject_id) == ("scheduler", "lesson_instance", int(failing))
    assert incident.error_class == "RuntimeError"
