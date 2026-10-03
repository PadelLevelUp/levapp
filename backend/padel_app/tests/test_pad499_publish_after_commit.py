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
        # #527 final read item 2: SQLAlchemy 1.4 fires after_commit on a SAVEPOINT release too
        # (enrol's _get_or_insert); only the real commit counts.
        if not session.in_nested_transaction():
            seen.append("commit")

    def fake_publish(event, user_ids):
        # The message id, so the retired invitation's edit is told from the accepter's own bubble.
        message_id = (event.get("payload") or {}).get("id") if event.get("type") == "message_edited" else None
        seen.append(f"publish:{event.get('type')}" + (f":{message_id}" if message_id else ""))

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
        retired_message = events[b].message_id
        ns.respond_to_notification(events[a].id, "yes", Player.query.get(a).user_id, now=NOW + timedelta(minutes=1))
        _published_at_the_closing_commit(trail, retired_message)


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
        assert not [t for t in trail if t.startswith("publish:message_edited")], trail


# ── B-284 / #527 re-review: the edit goes out at the commit that closed the spot ──────────────
# `_publish_retired` queues for the NEXT commit. Called after the caller's own commit, the edit
# waited for whatever committed next — a later message, or nothing at all.

def _published_at_the_closing_commit(trail, retired_message_id):
    """The retired invitation's edit runs in the after_commit of the first commit after the close."""
    assert retired_message_id, "the retired invitation has no message to edit"
    assert "close" in trail, trail
    i_commit = trail.index("commit", trail.index("close"))
    nxt = trail.index("commit", i_commit + 1) if "commit" in trail[i_commit + 1:] else len(trail)
    assert f"publish:message_edited:{retired_message_id}" in trail[i_commit + 1:nxt], (
        f"message {retired_message_id}'s edit did not go out with the commit that closed the spot: {trail}"
    )


def _message_of(event_id):
    from padel_app.models import NotificationEvent

    return NotificationEvent.query.get(event_id).message_id


def test_coach_accept_publishes_at_its_commit(app, trail):
    from padel_app.services.notification_service import coach_respond_to_notification
    from padel_app.tests.test_notification_integration import PATCHES as INT_PATCHES
    from padel_app.tests.test_pad317_one_vacancy_close import _invite, _open_vacancy, _world

    ids = _world(app)
    with app.app_context():
        vacancy_id = _open_vacancy(ids["instance_id"], ids["coach_id"], ids["ana"])
        accepted = _invite(ids["instance_id"], ids["coach_id"], ids["bea"], vacancy_id, "sent")
        retired_message = _message_of(_invite(ids["instance_id"], ids["coach_id"], ids["caio"], vacancy_id, "sent"))
        trail.clear()
        with patch(INT_PATCHES[1]):  # push only; `publish` is the trail's
            coach_respond_to_notification(accepted, "yes", ids["coach_id"])
        _published_at_the_closing_commit(trail, retired_message)


def test_waiting_list_yes_publishes_at_its_commit(app, trail):
    """PAD-446: the waiting list is invitation group 0; its door is the student accept."""
    from padel_app.models import NotificationEvent, WaitingListEntry
    from padel_app.services.notification_service import respond_to_notification
    from padel_app.tests.test_notification_integration import PATCHES as INT_PATCHES
    from padel_app.tests.test_pad317_one_vacancy_close import _invite, _open_vacancy, _world

    ids = _world(app)
    with app.app_context():
        vacancy_id = _open_vacancy(ids["instance_id"], ids["coach_id"], ids["ana"])
        retired_message = _message_of(_invite(ids["instance_id"], ids["coach_id"], ids["caio"], vacancy_id, "sent"))
        bea = _invite(ids["instance_id"], ids["coach_id"], ids["bea"], vacancy_id, "sent")
        NotificationEvent.query.get(bea).round_number = 0
        db.session.add(WaitingListEntry(lesson_instance_id=ids["instance_id"], player_id=ids["bea"],
                                        coach_id=ids["coach_id"], is_active=True))
        db.session.commit()
        trail.clear()
        with patch(INT_PATCHES[1]):  # push only; `publish` is the trail's
            assert respond_to_notification(bea, "yes", ids["bea_user_id"])["action"] == "confirmed"
        _published_at_the_closing_commit(trail, retired_message)


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
        retired_message = _message_of(_invite(ids["instance_id"], ids["coach_id"], candidate, vacancy_id, "sent"))
    request_id, _, _ = _request(app, ids, asker)
    trail.clear()
    with patch(INT_PATCHES[1]):  # push only; `publish` is the trail's
        assert _decide(app, ids, request_id, accept=True) == "accepted"
    _published_at_the_closing_commit(trail, retired_message)


def test_the_return_publishes_at_its_commit(app, monkeypatch, trail):
    from padel_app.services.notification_service import respond_to_reminder
    from padel_app.tests.helpers import pin_clock
    from padel_app.tests.test_pad499_accept_lock_ends_early import _cancelled_then_back

    pin_clock(monkeypatch, NOW)
    instance_id, r_user, invite_id, _i_user = _cancelled_then_back(app)
    with app.app_context(), patch(PATCHES[1]):
        retired_message = _message_of(invite_id)
        trail.clear()
        assert respond_to_reminder(instance_id, "yes", r_user, now=NOW + timedelta(minutes=2))["action"] == "confirmed"
        _published_at_the_closing_commit(trail, retired_message)


def test_reconcile_publishes_at_its_commit(app, trail):
    from padel_app.models import LessonInstance
    from padel_app.services.notification_service import reconcile_vacancies
    from padel_app.tests.test_pad317_one_vacancy_close import _invite, _open_vacancy, _world

    ids = _world(app, max_players=1)  # full: Ana holds the one place
    with app.app_context():
        vacancy_id = _open_vacancy(ids["instance_id"], ids["coach_id"])
        retired_message = _message_of(_invite(ids["instance_id"], ids["coach_id"], ids["bea"], vacancy_id, "sent"))
        trail.clear()
        assert reconcile_vacancies(LessonInstance.query.get(ids["instance_id"]))
        _published_at_the_closing_commit(trail, retired_message)


@pytest.mark.parametrize("stale_spot", [False, True])
def test_the_coach_putting_a_returner_back_publishes_at_its_commit(app, monkeypatch, trail, stale_spot):
    """enrol's return. Without a stale spot the reconcile closes nothing and commits nothing, and
    either order publishes at the same commit (a guard). With one, the reconcile closes it and
    commits: the returner's own retired edit must go out with that commit (#527 final read 6)."""
    from padel_app.models.lesson_instances import LessonInstance
    from padel_app.models.players import Player
    from padel_app.services.lesson_service import enrol
    from padel_app.tests.helpers import pin_clock
    from padel_app.tests.test_pad499_accept_lock_ends_early import _cancelled_then_back

    pin_clock(monkeypatch, NOW)
    instance_id, r_user, invite_id, _i_user = _cancelled_then_back(app)
    with app.app_context(), patch(PATCHES[1]):
        if stale_spot:
            from padel_app.models.vacancy import Vacancy

            coach_id = Vacancy.query.filter_by(lesson_instance_id=instance_id).first().coach_id
            db.session.add(Vacancy(lesson_instance_id=instance_id, coach_id=coach_id, status="open",
                                   current_round_number=1, current_batch_number=1, last_activity_at=NOW))
            db.session.commit()
        retired_message = _message_of(invite_id)
        r_player = Player.query.filter_by(user_id=r_user).one().id
        trail.clear()
        enrol(r_player, LessonInstance.query.get(instance_id), "coach")
        assert trail.count("close") == (2 if stale_spot else 1), trail
        _published_at_the_closing_commit(trail, retired_message)


# ── #527 final read items 1 and 3: nothing goes out before the REAL commit ──────────────────

@pytest.mark.parametrize("where", ["enrolment", "commit"])
def test_a_failed_single_commit_publishes_nothing(app, monkeypatch, trail, where):
    """r3: X's yes closes V1 (retiring Z's invitation) and the single commit then fails. Neither
    X's own "Accepted" edit nor Z's retired bubble may have been published: the database rolled
    back, so X holds no place and Z's invitation is live. (A savepoint inside the enrolment used to
    fire the queue early; publishing at once instead of queueing fails this too.)"""
    from padel_app.models.notification_event import NotificationEvent
    from padel_app.services import notification_service as ns
    from padel_app.tests.helpers import pin_clock
    from padel_app.tests.test_pad499_accept_lock_ends_early import _two_open_spots_for_one_place

    pin_clock(monkeypatch, NOW)
    instance_id, ids, (x, _y, z) = _two_open_spots_for_one_place(app)
    real_add = ns._add_player_to_instance

    def failing(player_id, instance):
        if where == "enrolment":
            raise RuntimeError("enrolment failed")
        real_commit = db.session.commit

        def boom():
            raise RuntimeError("commit failed")

        monkeypatch.setattr(db.session, "commit", boom)
        try:
            return real_add(player_id, instance)
        finally:
            monkeypatch.setattr(db.session, "commit", real_commit)

    monkeypatch.setattr(ns, "_add_player_to_instance", failing)
    with app.app_context(), patch(PATCHES[1]):
        watched = {db.session.get(NotificationEvent, ids[p][0]).message_id for p in (x, z)}
        trail.clear()
        with pytest.raises(RuntimeError):
            ns.respond_to_notification(ids[x][0], "yes", ids[x][1], now=NOW + timedelta(minutes=1))
        db.session.rollback()
        db.session.commit()  # a later, unrelated commit must not send them either
        sent = [t for t in trail if t.startswith("publish:message_edited")]
        assert not [t for t in sent if int(t.rsplit(":", 1)[1]) in watched], trail


def test_the_queue_waits_through_a_savepoint_release_and_survives_its_rollback(app):
    """padel_app.tools.after_commit: a SAVEPOINT is not the transaction. Its release must not run
    the queue, and its rollback must not drop it; the real commit runs it, a real rollback drops it."""
    from sqlalchemy import text

    from padel_app.tools.after_commit import on_commit

    ran = []
    with app.app_context():
        db.session.commit()
        on_commit(lambda: ran.append("a"))
        db.session.begin_nested().commit()          # release
        assert ran == []
        sp = db.session.begin_nested()
        sp.rollback()                               # savepoint rollback
        db.session.commit()
        assert ran == ["a"]

        db.session.execute(text("SELECT 1"))       # a transaction is open, as after any flush
        on_commit(lambda: ran.append("b"))
        db.session.rollback()
        db.session.commit()
        assert ran == ["a"]


def test_the_coach_marking_a_returner_present_publishes_at_its_commit(app, monkeypatch, trail):
    """#527 final read item 6 (add_presences). R cancelled (R's spot V_R invites I); the class also
    carries a stale open V_X. The coach marks R present: R's own V_R closes (retiring I's
    invitation), and the reconcile then closes V_X — and commits. I's retired edit must go out with
    that commit; queued after the reconcile it would wait for a later, unrelated one."""
    from padel_app.models import Coach
    from padel_app.models.lesson_instances import LessonInstance
    from padel_app.models.players import Player
    from padel_app.models.vacancy import Vacancy
    from padel_app.services.lesson_service import add_presences
    from padel_app.tests.helpers import pin_clock
    from padel_app.tests.test_pad499_accept_lock_ends_early import _cancelled_then_back

    pin_clock(monkeypatch, NOW)
    instance_id, r_user, invite_id, _i_user = _cancelled_then_back(app)
    with app.app_context(), patch(PATCHES[1]):
        instance = LessonInstance.query.get(instance_id)
        coach_id = Vacancy.query.filter_by(lesson_instance_id=instance_id).first().coach_id
        db.session.add(Vacancy(lesson_instance_id=instance_id, coach_id=coach_id, status="open",
                               current_round_number=1, current_batch_number=1, last_activity_at=NOW))
        db.session.commit()
        retired_message = _message_of(invite_id)
        r_player = Player.query.filter_by(user_id=r_user).one().id
        trail.clear()
        add_presences(instance, [{"playerId": r_player, "status": "present"}])
        assert trail.count("close") == 2, trail  # R's own spot, then the stale one
        _published_at_the_closing_commit(trail, retired_message)
