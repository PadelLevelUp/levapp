"""
PAD-733: the writes that open a spot answer before any invitation goes out.

cancel_attendance, presences/confirm and a student's "no" on notify/respond used to run the
invitation fan-out inside the request (one commit per student; 2.7-12 s in the PAD-687 access log).
They now commit the user's own change, arm a one-shot job on the scheduler and answer; the job
sends the invitations within seconds. Invitations rule 1b (one start per vacancy, under its claim
lock) is what makes the extra caller safe.

Pinned clock (`NOW`, the class tomorrow 09:00, the invitation window open). Two scheduler modes:
- client mode (`WORKER_SPLIT` on, the API only writes the shared store): `live_scheduler`, a real
  APScheduler started paused, so the armed job waits in the store until the test runs it;
- the API's own scheduler (`WORKER_SPLIT` off, production today): a real APScheduler, running,
  which picks the job up on its own thread.
With no scheduler in the process (CLI, the rest of the suite) the request still sends inline.
"""
import contextlib
import time
from datetime import timedelta
from unittest.mock import patch

import pytest

from padel_app.sql_db import db
from padel_app.tests.test_pad493_invitations_run_twice import NOW, PATCHES, _live_events, _seed


def _io():
    stack = contextlib.ExitStack()
    for target in PATCHES:
        stack.enter_context(patch(target))
    stack.enter_context(patch("padel_app.utils.expo_push.send_expo_push_to_user"))
    return stack


def _token(app, user_id):
    from flask_jwt_extended import create_access_token

    app.config["JWT_SECRET_KEY"] = "test-secret"
    with app.app_context():
        return {"Authorization": f"Bearer {create_access_token(identity=str(user_id))}"}


def _invited(instance_id):
    """Every invitation of the class, live or answered: a second send would show here."""
    from padel_app.models.notification_event import NotificationEvent

    return [(e.vacancy_id, e.player_id) for e in NotificationEvent.query.filter_by(
        lesson_instance_id=instance_id).order_by(NotificationEvent.id).all()]


def _armed(sched, prefix):
    return [j for j in sched._scheduler.get_jobs() if j.id.startswith(prefix)]


def _run(app, job):
    """Run an armed job as the scheduler would: on no request, in its own app context."""
    job.func(*job.args)


def _coach_user(coach_id):
    from padel_app.models.coaches import Coach

    return db.session.get(Coach, coach_id).user_id


def _confirm_absent(client, app, instance_id, coach_id, player_id):
    from padel_app.models.lesson_instances import LessonInstance

    with app.app_context():
        lesson_id = db.session.get(LessonInstance, instance_id).lesson_id
        coach_user = _coach_user(coach_id)
    headers = _token(app, coach_user)
    return client.post(
        "/api/app/class_instance/presences/confirm",
        json={"classInstance": {"parentClassId": lesson_id, "originalId": instance_id},
              "presences": [{"playerId": player_id, "status": "absent", "justification": "unjustified"}]},
        headers=headers,
    )


def _enrolled_player(instance_id):
    from padel_app.models.presences import Presence

    return Presence.query.filter_by(lesson_instance_id=instance_id).one().player_id


# --- cancel_attendance -----------------------------------------------------------------------

def test_a_cancellation_answers_before_the_first_invitation_and_the_job_sends_once(app, client, live_scheduler, monkeypatch):
    from padel_app.tests.helpers import pin_clock

    pin_clock(monkeypatch, NOW)
    with app.app_context():
        instance_id, coach_id, (student_user,), _ = _seed(enrolled=1, candidates=3, max_players=1)

    with _io():
        res = client.post("/api/app/notify/cancel_attendance", json={"lessonInstanceId": instance_id},
                          headers=_token(app, student_user))
        assert res.status_code == 200, res.get_json()
        assert res.get_json()["action"] == "declined"

        with app.app_context():
            assert _invited(instance_id) == [], "the answer went out before any invitation"
        (job,) = _armed(live_scheduler, "invite_now_")
        assert job.id == f"invite_now_{instance_id}"

        _run(app, job)
        with app.app_context():
            sent = _invited(instance_id)
        assert len(sent) == 3, "the job sends the first batch (maxSimultaneous 3)"

        _run(app, job)  # a second run (the sweep, a re-armed start) starts nothing
        with app.app_context():
            assert _invited(instance_id) == sent


# --- presences/confirm -----------------------------------------------------------------------

def test_an_attendance_sheet_answers_before_the_first_invitation_and_the_job_sends_once(app, client, live_scheduler, monkeypatch):
    from padel_app.tests.helpers import pin_clock

    pin_clock(monkeypatch, NOW)
    with app.app_context():
        instance_id, coach_id, _, _ = _seed(enrolled=1, candidates=3, max_players=1)
        absent = _enrolled_player(instance_id)

    with _io():
        res = _confirm_absent(client, app, instance_id, coach_id, absent)
        assert res.status_code == 200, res.get_json()
        body = res.get_json()
        assert body["notifiedPlayers"] == []
        assert body["invitationsQueued"] is True

        with app.app_context():
            assert _invited(instance_id) == []
        (job,) = _armed(live_scheduler, "invite_now_")

        _run(app, job)
        with app.app_context():
            sent = _invited(instance_id)
        assert len(sent) == 3

        _run(app, job)
        with app.app_context():
            assert _invited(instance_id) == sent

        # The coach saves the same sheet again: the job is re-armed and starts nothing new.
        assert _confirm_absent(client, app, instance_id, coach_id, absent).status_code == 200
        (again,) = _armed(live_scheduler, "invite_now_")
        _run(app, again)
        with app.app_context():
            assert _invited(instance_id) == sent


def test_without_a_scheduler_the_sheet_still_invites_inline(app, client, monkeypatch):
    """CLI and the rest of the suite: no scheduler in the process, the old inline path."""
    from padel_app.tests.helpers import pin_clock

    pin_clock(monkeypatch, NOW)
    with app.app_context():
        instance_id, coach_id, _, _ = _seed(enrolled=1, candidates=3, max_players=1)
        absent = _enrolled_player(instance_id)

    with _io():
        body = _confirm_absent(client, app, instance_id, coach_id, absent).get_json()
    assert body["invitationsQueued"] is False
    assert len(body["notifiedPlayers"]) == 3
    with app.app_context():
        assert len(_invited(instance_id)) == 3


# --- notify/respond --------------------------------------------------------------------------

def test_a_students_no_answers_before_the_next_invitation_and_the_job_sends_one(app, client, live_scheduler, monkeypatch):
    from padel_app.models.players import Player
    from padel_app.services.notification_service import trigger_invitations
    from padel_app.tests.helpers import pin_clock

    pin_clock(monkeypatch, NOW)
    with app.app_context(), _io():
        instance_id, coach_id, _, (first, second, third) = _seed(enrolled=0, candidates=3, max_players=1, max_sim=1)
        from padel_app.models.lesson_instances import LessonInstance
        trigger_invitations(db.session.get(LessonInstance, instance_id), coach_id, now=NOW)
        ((spot, invited),) = _invited(instance_id)
        assert invited == first
        from padel_app.models.notification_event import NotificationEvent
        event_id = NotificationEvent.query.filter_by(lesson_instance_id=instance_id, player_id=first).one().id
        first_user = db.session.get(Player, first).user_id

    pin_clock(monkeypatch, NOW + timedelta(minutes=1))
    with _io():
        res = client.post("/api/app/notify/respond", json={"notificationEventId": event_id, "action": "no"},
                          headers=_token(app, first_user))
        assert res.status_code == 200, res.get_json()
        assert res.get_json()["action"] == "declined"

        with app.app_context():
            assert _invited(instance_id) == [(spot, first)], "nobody else is invited inside the answer"
        (job,) = _armed(live_scheduler, "decline_next_")
        assert job.id == f"decline_next_{spot}_{event_id}"

        _run(app, job)
        with app.app_context():
            assert _invited(instance_id) == [(spot, first), (spot, second)]
            assert _live_events(instance_id) == [(spot, second)]

        # The job is one-shot (gone once the scheduler has run it). A repeated "no" is answered
        # as already taken (B-260, invitations rule 17) and arms nothing: no second follow-up.
        live_scheduler._scheduler.remove_job(job.id)
        again = client.post("/api/app/notify/respond", json={"notificationEventId": event_id, "action": "no"},
                            headers=_token(app, first_user))
        assert again.status_code == 200
        assert _armed(live_scheduler, "decline_next_") == []
        with app.app_context():
            assert _invited(instance_id) == [(spot, first), (spot, second)]


# --- the API's own scheduler (WORKER_SPLIT off) ----------------------------------------------

@pytest.fixture
def running_scheduler(app):
    """The scheduler as production runs it today (the worker role off): started, not paused, so a
    job armed by a request runs on the scheduler's own thread."""
    from apscheduler.jobstores.memory import MemoryJobStore
    from apscheduler.schedulers.background import BackgroundScheduler

    from padel_app import scheduler as sched

    previous = (sched._app, sched._scheduler)
    real = BackgroundScheduler(jobstores={"default": MemoryJobStore()}, timezone="UTC")
    real.start()
    sched._scheduler = real
    sched._app = app
    try:
        yield sched
    finally:
        real.shutdown(wait=True)
        sched._app, sched._scheduler = previous


def test_with_the_worker_off_the_apis_own_scheduler_sends_the_invitations(app, client, running_scheduler, monkeypatch):
    from padel_app.tests.helpers import pin_clock

    pin_clock(monkeypatch, NOW)
    with app.app_context():
        instance_id, coach_id, (student_user,), _ = _seed(enrolled=1, candidates=3, max_players=1)

    with _io():
        res = client.post("/api/app/notify/cancel_attendance", json={"lessonInstanceId": instance_id},
                          headers=_token(app, student_user))
        assert res.status_code == 200, res.get_json()

        deadline = time.monotonic() + 15
        sent = []
        while time.monotonic() < deadline:
            with app.app_context():
                sent = _invited(instance_id)
            if len(sent) == 3 and not running_scheduler._scheduler.get_jobs():
                break
            time.sleep(0.2)
    assert len(sent) == 3, f"the scheduler thread sent the first batch: {sent}"
    assert running_scheduler._scheduler.get_jobs() == [], "the one-shot job ran and is gone"


# --- semi-automatic: the coach's approval prompt -------------------------------------------------

def _approval_state(instance_id):
    """The class's vacancies' approval status, its prompts and its approval messages."""
    from padel_app.models import Message, Vacancy
    from padel_app.models.replacement_approval_prompt import ReplacementApprovalPrompt

    vacancies = Vacancy.query.filter_by(lesson_instance_id=instance_id).all()
    prompts = ReplacementApprovalPrompt.query.filter(
        ReplacementApprovalPrompt.vacancy_id.in_([v.id for v in vacancies])).all()
    messages = [m for m in Message.query.filter_by(message_type="replacement_approval").all()
                if (m.msg_metadata or {}).get("lessonInstanceId") == instance_id]
    return [v.approval_status for v in vacancies], len(prompts), len(messages)


def test_a_semi_automatic_cancellation_answers_before_the_coachs_approval_prompt(app, client, live_scheduler, monkeypatch):
    from padel_app.services import replacement_approval_service as approvals
    from padel_app.tests.helpers import pin_clock

    pin_clock(monkeypatch, NOW)
    with app.app_context():
        instance_id, _coach_id, (student_user,), _ = _seed(enrolled=1, candidates=3, max_players=1, semi=True)

    queue_builds = []
    real_queue = approvals.compute_full_invite_queue
    monkeypatch.setattr(approvals, "compute_full_invite_queue",
                        lambda *a, **k: queue_builds.append(1) or real_queue(*a, **k))
    with _io():
        res = client.post("/api/app/notify/cancel_attendance", json={"lessonInstanceId": instance_id},
                          headers=_token(app, student_user))
        assert res.status_code == 200, res.get_json()
        assert res.get_json()["action"] == "declined"

        assert queue_builds == [], "the request no longer ranks the roster for the prompt"
        with app.app_context():
            assert _approval_state(instance_id) == (["pending"], 0, 0)
            assert _invited(instance_id) == []
        (job,) = _armed(live_scheduler, "approval_now_")
        assert job.id == f"approval_now_{instance_id}"

        _run(app, job)
        assert queue_builds == [1], "the job builds the queue"
        with app.app_context():
            assert _approval_state(instance_id) == (["pending"], 1, 1)

        _run(app, job)  # a second run (a re-armed decline) asks nothing more
        with app.app_context():
            assert _approval_state(instance_id) == (["pending"], 1, 1)
            assert _invited(instance_id) == [], "approval asked; nobody invited before the coach answers"


def test_without_a_scheduler_the_semi_automatic_cancellation_still_asks_inline(app, client, monkeypatch):
    from padel_app.tests.helpers import pin_clock

    pin_clock(monkeypatch, NOW)
    with app.app_context():
        instance_id, _coach_id, (student_user,), _ = _seed(enrolled=1, candidates=3, max_players=1, semi=True)

    with _io():
        res = client.post("/api/app/notify/cancel_attendance", json={"lessonInstanceId": instance_id},
                          headers=_token(app, student_user))
        assert res.status_code == 200, res.get_json()
        with app.app_context():
            assert _approval_state(instance_id) == (["pending"], 1, 1)
