"""PAD-721 (PAD-669 R2; notifications.waiting-list rule 15): a waiting-list credit is spent only when
the student takes the spot.

- A join request accepted by the coach for a student on a standing entry with NO credit limit
  (`credits_total` NULL, PAD-560) compared `credits_used >= None` and failed with a 500.
- An invitation sent and not answered spends nothing (pinned: nothing tested it).
"""
from datetime import timedelta

import pytest

from padel_app.sql_db import db
from padel_app.tests.test_pad547_coach_adds_to_class_waiting_list import _quiet


@pytest.mark.parametrize("credits", [None, 3], ids=["no-limit", "three-credits"])
def test_accepting_a_join_request_spends_a_credit_without_failing_on_an_unlimited_entry(app, monkeypatch, credits):
    from padel_app.models.standing_waiting_list_entry import StandingWaitingListEntry
    from padel_app.services.notification_service import add_standing_waiting_list_entry
    from padel_app.tests.test_pad128_eligibility import _seed
    from padel_app.tests.test_pad131_join_requests import LEVEL_SAME, _config, _decide, _request, _student
    from padel_app.utils.dates import utcnow_naive

    _quiet(monkeypatch)
    ids = _seed(app, eligibility_rules=LEVEL_SAME)
    _config(app, ids, open_spots_visible=True)
    pid = _student(app, ids, "carla")
    with app.app_context():
        entry_id = add_standing_waiting_list_entry(
            ids["coach_id"], pid, credits, expires_at=utcnow_naive() + timedelta(days=30)
        ).id
    rid, _, _ = _request(app, ids, pid)
    assert _decide(app, ids, rid, accept=True) == "accepted"
    with app.app_context():
        entry = db.session.get(StandingWaitingListEntry, entry_id)
        assert (entry.credits_used, entry.is_active) == (1, True)


def test_an_invitation_sent_and_not_answered_spends_no_credit(app, monkeypatch):
    """R2's other half: being asked costs nothing. A one-credit standing student is invited (group 0)
    for an opened spot and does not answer: the credit is untouched and the entry stays active."""
    from padel_app.models.standing_waiting_list_entry import StandingWaitingListEntry
    from padel_app.tests.helpers import pin_clock
    from padel_app.tests.test_pad446_waiting_list_group_zero import NOW, _entry, _event, _io, _seed, _standing, _trigger

    pin_clock(monkeypatch, NOW)
    with app.app_context(), _io():
        instance_id, coach_id, _, (bea,) = _seed(enrolled=0, candidates=1, max_players=1, max_sim=1)
        standing = _standing(coach_id, bea, NOW - timedelta(days=1), credits=1)
        standing_id = standing.id
        _entry(instance_id, coach_id, bea, NOW - timedelta(hours=1), standing=standing)
        _trigger(instance_id, coach_id)
        event = _event(instance_id, bea)
        assert (event.round_number, event.status) == (0, "sent")
        entry = db.session.get(StandingWaitingListEntry, standing_id)
        assert (entry.credits_used, entry.is_active) == (0, True)
