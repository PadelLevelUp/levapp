"""PAD-918: the operator's commands around the per-coach switch (notifications.config rule 18), as
the staging runbook runs them: status, switch (one way, --yes), pause and resume."""
from datetime import timedelta

import pytest

from padel_app.sql_db import db
from padel_app.tests.test_pad916_engine_store import NOW, START, _seed


@pytest.mark.criterion("NOTIFICATIONS-CONFIG-50")
def test_the_engine_commands_switch_pause_and_resume_a_coach(app, monkeypatch):
    from padel_app.models import EngineSession
    from padel_app.models.notification_config import NotificationConfig
    from padel_app.tests.helpers import pin_clock

    with app.app_context():
        pin_clock(monkeypatch, NOW)
        store, (session,), _ = _seed(app, starts=(START + timedelta(days=3),))
        coach = store.coach_of(session)
        EngineSession.query.delete()                       # not on the new engine until switched
        db.session.add(NotificationConfig(coach_id=coach, auto_notify_enabled=True))
        db.session.commit()
    run = lambda *args: app.test_cli_runner().invoke(args=["engine", *args])  # noqa: E731

    assert "engine old" in run("status", str(coach)).output
    refused = run("switch", str(coach))
    assert refused.exit_code == 1 and "one way" in refused.output
    switched = run("switch", str(coach), "--yes")
    assert switched.exit_code == 0 and f"adopted: {session}" in switched.output and "engine new" in switched.output
    assert "automatic invitations off" in run("pause", str(coach)).output
    assert "automatic invitations on" in run("resume", str(coach)).output
    assert run("status", "999999").exit_code == 1
