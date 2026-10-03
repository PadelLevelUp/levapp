"""
PAD-499 (#527 review items 4 and 6): the live edits of the invitations a close retired are published
only AFTER the commit that makes them real, on every path, and never after a rollback.

Ordering is read from SQLAlchemy's own after_commit event (a second connection in this harness can
see flushed rows, so it cannot tell a flush from a commit — memory "after-commit needs a commit
counter"). A trail records "commit" on after_commit and "publish:<type>" on publish.
"""
from datetime import timedelta
from unittest.mock import patch

import pytest
from sqlalchemy import event as sa_event
from sqlalchemy.orm import Session

from padel_app.sql_db import db
from padel_app.tests.test_pad493_invitations_run_twice import NOW, PATCHES, _seed


@pytest.fixture
def trail(monkeypatch):
    from padel_app.services import notification_service as ns

    seen = []

    def on_commit(session):
        seen.append("commit")

    def fake_publish(event, user_ids):
        seen.append(f"publish:{event.get('type')}")

    monkeypatch.setattr(ns, "publish", fake_publish)
    sa_event.listen(Session, "after_commit", on_commit)
    yield seen
    sa_event.remove(Session, "after_commit", on_commit)


def _two_invited(app):
    from padel_app.models.lesson_instances import LessonInstance
    from padel_app.models.notification_event import NotificationEvent
    from padel_app.services.notification_service import trigger_invitations

    instance_id, coach_id, _, (a, b) = _seed(enrolled=0, candidates=2, max_players=1)
    with patch(PATCHES[0]):
        trigger_invitations(LessonInstance.query.get(instance_id), coach_id, now=NOW)
    events = {e.player_id: e for e in NotificationEvent.query.filter_by(lesson_instance_id=instance_id)}
    return instance_id, coach_id, a, b, events


def test_the_retired_invitations_edit_is_published_after_the_commit_that_closed_the_spot(app, monkeypatch, trail):
    from padel_app.models.players import Player
    from padel_app.services import notification_service as ns
    from padel_app.tests.helpers import pin_clock

    pin_clock(monkeypatch, NOW)
    with app.app_context(), patch(PATCHES[1]):
        instance_id, coach_id, a, b, events = _two_invited(app)
        real_close = ns._close_vacancy

        def close(*args, **kwargs):
            trail.append("close")
            return real_close(*args, **kwargs)

        monkeypatch.setattr(ns, "_close_vacancy", close)
        trail.clear()
        ns.respond_to_notification(events[a].id, "yes", Player.query.get(a).user_id, now=NOW + timedelta(minutes=1))
        i_close = trail.index("close")
        edits = [i for i, t in enumerate(trail) if t == "publish:message_edited" and i > i_close]
        assert edits, trail
        assert "commit" in trail[i_close:edits[0]], f"the edit was published before a commit: {trail}"


def test_a_rollback_drops_the_queued_publishes(app, monkeypatch, trail):
    from padel_app.models.notification_event import NotificationEvent
    from padel_app.services import notification_service as ns
    from padel_app.tests.helpers import pin_clock

    pin_clock(monkeypatch, NOW)
    with app.app_context(), patch(PATCHES[1]):
        instance_id, coach_id, a, b, events = _two_invited(app)
        trail.clear()
        retired = [db.session.get(NotificationEvent, events[b].id)]
        ns._publish_retired(retired)          # queued for the next commit
        db.session.rollback()                 # ... which never comes for this work
        db.session.commit()                   # a later, unrelated commit
        assert "publish:message_edited" not in trail, trail
