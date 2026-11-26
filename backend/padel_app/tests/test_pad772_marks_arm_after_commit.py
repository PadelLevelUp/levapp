"""
PAD-772b (review of the mark): a block save's mark of a semi-automatic class arms the coach's approval prompt
only after the entry has committed.

`_run_entry` declines inside one unit of work, so the decline's flushes are not durable until the entry
commits. PAD-733 arms the prompt on the scheduler (`arm_approval_now`), whose job reads with its own session:
armed before the commit, it cannot see the vacancy, finds nothing to ask about and is never retried, so the
coach's approval prompt of a marked class was lost. The ordinary `cancel_attendance` route commits before it
arms; the mark must behave the same ("like any can't go", owner, 26 Nov 2026).

The scheduler as production runs it (started, its own thread), as in `test_pad764`'s.
"""
import time

import pytest

from padel_app.sql_db import db
from padel_app.tests.test_pad493_invitations_run_twice import NOW, START, _seed
from padel_app.tests.test_pad733_fan_out_off_the_request import (  # noqa: F401  (the fixture)
    _approval_state,
    _invited,
    _io,
    _token,
    running_scheduler,
)


@pytest.mark.criterion("CALENDAR-STUDENT-BLOCKERS-19")
def test_a_marked_class_in_semi_automatic_mode_gets_its_approval_prompt(app, client, running_scheduler, monkeypatch):
    from padel_app.tests.helpers import pin_clock

    pin_clock(monkeypatch, NOW)
    with app.app_context():
        instance_id, _coach_id, (first, _second), _ = _seed(enrolled=2, candidates=3, max_players=2, semi=True)

    # What a job armed now would see: a separate connection (the scheduler's own session) reads the class's
    # vacancies. The real job-adding step runs after the spy.
    from sqlalchemy import text

    from padel_app import scheduler as sched

    seen = []
    real_arm = sched._add_one_shot

    def spy(func, args, job_id):
        with db.engine.connect() as other:
            visible = other.execute(text("select count(*) from vacancies where lesson_instance_id = :i"), {"i": instance_id}).scalar()
        seen.append((job_id, visible))
        return real_arm(func, args, job_id)

    monkeypatch.setattr(sched, "_add_one_shot", spy)

    day = START.date().isoformat()
    body = {"title": "Fora", "date": day, "startTime": "00:00", "endTime": "23:59", "isRecurring": False}
    with _io():
        res = client.post("/api/app/availability_blockers", json=body, headers=_token(app, first))
        assert res.status_code == 201, res.get_json()
        assert len(res.get_json()["markedClasses"]) == 1

        deadline = time.monotonic() + 15
        state = None
        while time.monotonic() < deadline:
            with app.app_context():
                state = _approval_state(instance_id)
                db.session.remove()
            if state[1] == 1 and not running_scheduler._scheduler.get_jobs():
                break
            time.sleep(0.2)

    assert seen and all(visible == 1 for _job, visible in seen), (
        "armed before the entry committed: the scheduler's session cannot see the vacancy", seen)
    statuses, prompts, messages = state
    assert statuses == ["pending"]
    assert prompts == 1, "the marked class's freed place has its approval prompt, built by the scheduler's own session"
    assert messages == 1
    with app.app_context():
        assert _invited(instance_id) == [], "approval asked; nobody invited before the coach answers"
