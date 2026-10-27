"""
PAD-764: a semi-automatic decline that lands while the class's approval job is running never got
its prompt.

PAD-733 (#855) armed one job per class, `approval_now_<instance>`, which asks for every open
vacancy still pending approval, read once when it starts. A second decline while that job runs
(seconds of work on a large roster) re-arms the same id; APScheduler then skips the new run
("maximum number of running instances reached", max_instances 1) and drops the one-shot job. The
running job's read predates the second vacancy, the 2-minute sweep never asks for a prompt and
invite_start fires once, so the second spot waited for approval with nothing to approve.

Invitations rule 1b: one job per vacancy, `approval_now_<instance>_<vacancy>`, each asking for its
own vacancy, so a decline during a running job runs its own.

The scheduler as production runs it (started, the API's own thread), with the first job held
inside its queue build while the second student cancels.
"""
import threading
import time

from padel_app.sql_db import db
from padel_app.tests.test_pad493_invitations_run_twice import NOW, _seed
from padel_app.tests.test_pad733_fan_out_off_the_request import (  # noqa: F401  (the fixture)
    _approval_state,
    _invited,
    _io,
    _token,
    running_scheduler,
)


def test_a_decline_during_a_running_approval_job_still_gets_its_prompt(app, client, running_scheduler, monkeypatch):
    from padel_app.services import replacement_approval_service as approvals
    from padel_app.tests.helpers import pin_clock

    pin_clock(monkeypatch, NOW)
    with app.app_context():
        instance_id, _coach_id, (first, second), _ = _seed(enrolled=2, candidates=3, max_players=2, semi=True)

    building, release = threading.Event(), threading.Event()
    real_queue = approvals.compute_full_invite_queue

    def held_first_build(*a, **k):
        if not building.is_set():
            building.set()
            release.wait(15)
        return real_queue(*a, **k)

    monkeypatch.setattr(approvals, "compute_full_invite_queue", held_first_build)
    try:
        with _io():
            res = client.post("/api/app/notify/cancel_attendance", json={"lessonInstanceId": instance_id},
                              headers=_token(app, first))
            assert res.status_code == 200, res.get_json()
            assert building.wait(15), "the first decline's job is building its queue"

            res = client.post("/api/app/notify/cancel_attendance", json={"lessonInstanceId": instance_id},
                              headers=_token(app, second))
            assert res.status_code == 200, res.get_json()
            time.sleep(1)  # the scheduler fires the second decline's job while the first still runs
            release.set()

            deadline = time.monotonic() + 15
            state = None
            while time.monotonic() < deadline:
                with app.app_context():
                    state = _approval_state(instance_id)
                    db.session.remove()
                if state[1] == 2 and not running_scheduler._scheduler.get_jobs():
                    break
                time.sleep(0.2)
    finally:
        release.set()

    statuses, prompts, messages = state
    assert statuses == ["pending", "pending"]
    assert prompts == 2, "each declined spot has its approval prompt"
    assert messages == 2
    with app.app_context():
        assert _invited(instance_id) == [], "approval asked; nobody invited before the coach answers"
