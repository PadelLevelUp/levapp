"""PAD-509: two spots of one class must not pick the same free student at the same moment.

notifications.invitations rule 18 (PAD-497): one live offer per student per class. Each sender
re-checks a student under its OWN vacancy's lock (`_send_invitation_batch`, PAD-495 item 3a), so
two senders on two different spots of one class hold two different locks: both can pass the
re-check for the same student before either inserts, and the student gets two invitations.

Forced, in PAD-495's style (`test_item_3a_…`): each sender pauses right after its re-check of its
FIRST student until the other has reached the same point. Postgres only: it needs two real
connections. This is the test half of PAD-509; the fix (a class-level lock, after PAD-499) is B's.
"""
import contextlib
import os
import threading

import pytest

from padel_app.sql_db import db
from padel_app.tests.test_pad493_invitations_run_twice import NOW, PATCHES, _live_events, _seed, _vacancies

pytestmark = pytest.mark.skipif(
    os.getenv("LEVAPP_TEST_DB", "sqlite").strip().lower() != "postgres",
    reason="forced race: needs two real connections (LEVAPP_TEST_DB=postgres)",
)


@contextlib.contextmanager
def _io():
    from unittest.mock import patch

    with patch(PATCHES[0]), patch(PATCHES[1]):
        yield


def test_two_spots_sending_at_once_never_offer_one_student_twice(app, monkeypatch):
    """Two open spots, two free students, one invitation per spot (maxSimultaneous 1). Both spots
    start sending at the same moment. Expected: each student holds at most one live offer for the
    class, and each spot still asks someone (the second skips the first's student and asks the
    other). Without a shared lock both spots pick the same first student."""
    from padel_app.models.lesson_instances import LessonInstance
    from padel_app.models.notification_config import NotificationConfig
    from padel_app.models.vacancy import Vacancy
    from padel_app.services import notification_service as ns
    from padel_app.tests.helpers import pin_clock
    from padel_app.tests.test_pad493_starts_and_pacing import _race

    pin_clock(monkeypatch, NOW)
    real_send = ns._send_invitation_batch

    # The two spots exist, nothing is sent yet: trigger_invitations opens both vacancies with its
    # senders stubbed out, so the race below is the FIRST send of each spot.
    with app.app_context(), _io():
        instance_id, coach_id, _, (x, y) = _seed(enrolled=0, candidates=2, max_players=2, max_sim=1)
        monkeypatch.setattr(ns, "_send_invitation_batch", lambda *a, **k: [])
        monkeypatch.setattr(ns, "_send_batch_locked", lambda *a, **k: [], raising=False)
        ns.trigger_invitations(LessonInstance.query.get(instance_id), coach_id, now=NOW)
        spots = [v[0] for v in _vacancies(instance_id) if v[1] == "open"]
        assert len(spots) == 2, _vacancies(instance_id)
        assert _live_events(instance_id) == [], "nothing may be sent before the race"
    monkeypatch.setattr(ns, "_send_invitation_batch", real_send)

    real_check = ns._still_invitable
    gate = threading.Barrier(2)
    seen = threading.local()

    def gated(*args, **kwargs):
        result = real_check(*args, **kwargs)
        if not getattr(seen, "done", False):
            seen.done = True
            try:
                gate.wait(timeout=1.5)  # with a shared lock the other sender waits on it: times out
            except threading.BrokenBarrierError:
                pass
        return result

    monkeypatch.setattr(ns, "_still_invitable", gated)

    def send(spot_id):
        def run():
            vacancy = db.session.get(Vacancy, spot_id)
            instance = db.session.get(LessonInstance, instance_id)
            config = NotificationConfig.query.filter_by(coach_id=coach_id).first()
            ns._send_invitation_batch(vacancy, instance, config, coach_id, now=NOW)
        return run

    with _io():
        _race(app, [send(spots[0]), send(spots[1])])

    with app.app_context():
        live = _live_events(instance_id)
        players = [p for _, p in live]
        assert len(players) == len(set(players)), f"a student holds two live offers for one class: {live}"
        assert {v for v, _ in live} == set(spots), f"a spot asked nobody: {live}"
        assert set(players) == {x, y}
