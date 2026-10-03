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
    # First in line, so "commit" is recorded before the queued actions that commit runs.
    sa_event.listen(Session, "after_commit", on_commit, insert=True)
    real_close = ns._close_vacancy

    def close(*args, **kwargs):
        seen.append("close")
        return real_close(*args, **kwargs)

    monkeypatch.setattr(ns, "_close_vacancy", close)
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


# ── B-284 / #527 re-review: the edit goes out at the commit that closed the spot ──────────────
# `_publish_retired` queues for the NEXT commit. Called after the caller's own commit, the edit
# waited for whatever committed next — a later message, or nothing at all.

def _published_at_the_closing_commit(trail):
    assert "close" in trail, trail
    i_close = trail.index("close")
    i_commit = trail.index("commit", i_close)
    assert trail[i_commit + 1:i_commit + 2] == ["publish:message_edited"], (
        f"the retired invitation's edit did not go out with the commit that closed the spot: {trail}"
    )


def test_coach_accept_publishes_at_its_commit(app, trail):
    from padel_app.services.notification_service import coach_respond_to_notification
    from padel_app.tests.test_notification_integration import PATCHES as INT_PATCHES
    from padel_app.tests.test_pad317_one_vacancy_close import _invite, _open_vacancy, _world

    ids = _world(app)
    with app.app_context():
        vacancy_id = _open_vacancy(ids["instance_id"], ids["coach_id"], ids["ana"])
        accepted = _invite(ids["instance_id"], ids["coach_id"], ids["bea"], vacancy_id, "sent")
        _invite(ids["instance_id"], ids["coach_id"], ids["caio"], vacancy_id, "sent")
        trail.clear()
        with patch(INT_PATCHES[1]):  # push only; `publish` is the trail's
            coach_respond_to_notification(accepted, "yes", ids["coach_id"])
        _published_at_the_closing_commit(trail)


def test_waiting_list_fill_publishes_at_its_commit(app, trail):
    from padel_app.models import LessonInstance, Vacancy, WaitingListEntry
    from padel_app.services.notification_service import _fill_from_waiting_list, get_or_create_config
    from padel_app.tests.test_notification_integration import PATCHES as INT_PATCHES
    from padel_app.tests.test_pad317_one_vacancy_close import _invite, _open_vacancy, _world

    ids = _world(app)
    with app.app_context():
        vacancy_id = _open_vacancy(ids["instance_id"], ids["coach_id"], ids["ana"])
        _invite(ids["instance_id"], ids["coach_id"], ids["caio"], vacancy_id, "sent")
        entry = WaitingListEntry(lesson_instance_id=ids["instance_id"], player_id=ids["bea"],
                                 coach_id=ids["coach_id"], is_active=True)
        db.session.add(entry)
        db.session.commit()
        trail.clear()
        with patch(INT_PATCHES[1]):  # push only; `publish` is the trail's
            assert _fill_from_waiting_list(entry, Vacancy.query.get(vacancy_id),
                                           LessonInstance.query.get(ids["instance_id"]), ids["coach_id"],
                                           get_or_create_config(ids["coach_id"])) is True
        _published_at_the_closing_commit(trail)


def test_join_accept_publishes_at_its_commit(app, trail):
    from padel_app.tests.test_notification_integration import PATCHES as INT_PATCHES
    from padel_app.tests.test_pad128_eligibility import _seed as _seed128
    from padel_app.tests.test_pad131_join_requests import _config, _decide, _request, _student
    from padel_app.tests.test_pad317_one_vacancy_close import _invite, _open_vacancy

    ids = _seed128(app, eligibility_rules=None)
    _config(app, ids, open_spots_visible=True)
    asker = _student(app, ids, "asker-499")
    candidate = _student(app, ids, "candidate-499")
    with app.app_context():
        vacancy_id = _open_vacancy(ids["instance_id"], ids["coach_id"])
        _invite(ids["instance_id"], ids["coach_id"], candidate, vacancy_id, "sent")
    request_id, _, _ = _request(app, ids, asker)
    trail.clear()
    with patch(INT_PATCHES[1]):  # push only; `publish` is the trail's
        assert _decide(app, ids, request_id, accept=True) == "accepted"
    _published_at_the_closing_commit(trail)


def test_the_return_publishes_at_its_commit(app, monkeypatch, trail):
    from padel_app.services.notification_service import respond_to_reminder
    from padel_app.tests.helpers import pin_clock
    from padel_app.tests.test_pad499_accept_lock_ends_early import _cancelled_then_back

    pin_clock(monkeypatch, NOW)
    instance_id, r_user, _invite_id, _i_user = _cancelled_then_back(app)
    with app.app_context(), patch(PATCHES[1]):
        trail.clear()
        assert respond_to_reminder(instance_id, "yes", r_user, now=NOW + timedelta(minutes=2))["action"] == "confirmed"
        _published_at_the_closing_commit(trail)


def test_reconcile_publishes_at_its_commit(app, trail):
    from padel_app.models import LessonInstance
    from padel_app.services.notification_service import reconcile_vacancies
    from padel_app.tests.test_pad317_one_vacancy_close import _invite, _open_vacancy, _world

    ids = _world(app, max_players=1)  # full: Ana holds the one place
    with app.app_context():
        vacancy_id = _open_vacancy(ids["instance_id"], ids["coach_id"])
        _invite(ids["instance_id"], ids["coach_id"], ids["bea"], vacancy_id, "sent")
        trail.clear()
        assert reconcile_vacancies(LessonInstance.query.get(ids["instance_id"]))
        _published_at_the_closing_commit(trail)
