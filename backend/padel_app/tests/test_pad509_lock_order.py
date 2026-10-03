"""PAD-509 (ledger B-300): the one lock order, vacancy then class, holds for senders too.

The fix for PAD-509 makes a sender take the CLASS lock (after its spot's lock) while it decides on a
student, so two spots of one class cannot pick the same student. Accepts already take the spot,
then the class (invitations rule 10). The deadlock this must never create is on ONE spot: an accept
holding V1 and wanting the class, against a sender that holds the class and wants V1. With the one
order the sender waits for V1 before it ever holds the class, so there is no cycle.

Forced: the accept pauses while holding V1 (and nothing else) until the sender has reached its
per-student lock section, then goes on to the class. Any error in either thread — Postgres's
DeadlockDetected above all — fails the cell; there is no retry to mask one. Postgres only.
"""
import contextlib
import os
import threading
import time
from datetime import timedelta

import pytest

from padel_app.sql_db import db
from padel_app.tests.test_pad493_invitations_run_twice import NOW, PATCHES, _seed

pytestmark = pytest.mark.skipif(
    os.getenv("LEVAPP_TEST_DB", "sqlite").strip().lower() != "postgres",
    reason="a lock cycle needs two real connections (LEVAPP_TEST_DB=postgres)",
)


@contextlib.contextmanager
def _io():
    from unittest.mock import patch

    with patch(PATCHES[0]), patch(PATCHES[1]):
        yield


def test_an_accept_and_a_sender_on_one_spot_never_deadlock(app, monkeypatch):
    from padel_app.models.lesson_instances import LessonInstance
    from padel_app.models.notification_config import NotificationConfig
    from padel_app.models.notification_event import NotificationEvent
    from padel_app.models.players import Player
    from padel_app.models.vacancy import Vacancy
    from padel_app.services import notification_service as ns
    from padel_app.tests.helpers import pin_clock
    from padel_app.tests.test_pad493_starts_and_pacing import _race

    pin_clock(monkeypatch, NOW)
    with app.app_context(), _io():
        instance_id, coach_id, _, (a, b) = _seed(enrolled=0, candidates=2, max_players=1, max_sim=1)
        ns.trigger_invitations(LessonInstance.query.get(instance_id), coach_id, now=NOW)
        (invite,) = NotificationEvent.query.filter_by(lesson_instance_id=instance_id).all()
        vacancy_id, event_id = invite.vacancy_id, invite.id
        accepter_user = Player.query.get(invite.player_id).user_id

    accept_holds_spot, sender_entered = threading.Event(), threading.Event()
    real_lock_both = ns._lock_vacancy_and_instance
    real_conversation = ns._get_or_create_direct_conversation

    def accept_lock(vacancy, instance):
        # The accept already holds V1 (its repeat check locked it); it pauses here, before the
        # class lock, until the sender is inside its per-student section.
        if threading.current_thread().name == "accept":
            accept_holds_spot.set()
            sender_entered.wait(timeout=5)
            time.sleep(0.5)  # the sender now takes its first lock
        return real_lock_both(vacancy, instance)

    def sender_conversation(coach_user_id, player_user_id):
        conversation = real_conversation(coach_user_id, player_user_id)
        if threading.current_thread().name == "sender":
            accept_holds_spot.wait(timeout=5)
            sender_entered.set()
        return conversation

    monkeypatch.setattr(ns, "_lock_vacancy_and_instance", accept_lock)
    monkeypatch.setattr(ns, "_get_or_create_direct_conversation", sender_conversation)
    results = {}

    def accept():
        threading.current_thread().name = "accept"
        results["accept"] = ns.respond_to_notification(event_id, "yes", accepter_user, now=NOW + timedelta(minutes=1))

    def sender():
        threading.current_thread().name = "sender"
        vacancy = db.session.get(Vacancy, vacancy_id)
        instance = db.session.get(LessonInstance, instance_id)
        config = NotificationConfig.query.filter_by(coach_id=coach_id).first()
        results["sender"] = ns._send_invitation_batch(vacancy, instance, config, coach_id, now=NOW)

    with _io():
        _race(app, [accept, sender])  # an error in either thread (DeadlockDetected) fails here

    assert results["accept"]["action"] == "confirmed", results
    assert results["sender"] == [], f"the sender invited for a spot already taken: {results}"
